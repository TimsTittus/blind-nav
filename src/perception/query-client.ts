import { AiProviderError, NetworkError } from "@/core";
import {
  type SceneQueryResponse,
  SceneQueryResponseSchema,
} from "./query-contract";

export const QUERY_ENDPOINT = "/api/vision/query";
export const DEFAULT_QUERY_TIMEOUT_MS = 12_000;

export interface SceneQueryClientRequest {
  dataUrl: string;
  capturedAt: number;
  question: string;
  width?: number;
  height?: number;
  signal?: AbortSignal;
}

export interface SceneQueryClientOptions {
  endpoint?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export interface SceneQueryClient {
  query(request: SceneQueryClientRequest): Promise<SceneQueryResponse>;
}

export function createSceneQueryClient(
  options: SceneQueryClientOptions = {},
): SceneQueryClient {
  const endpoint = options.endpoint ?? QUERY_ENDPOINT;
  const doFetch = options.fetchFn ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;

  return {
    async query(request) {
      const body = JSON.stringify({
        frame: {
          dataUrl: request.dataUrl,
          capturedAt: request.capturedAt,
          ...(request.width !== undefined ? { width: request.width } : {}),
          ...(request.height !== undefined ? { height: request.height } : {}),
        },
        question: request.question,
      });

      const signal = combineSignals(request.signal, timeoutMs);

      let response: Response;
      try {
        response = await doFetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          signal: signal.signal,
        });
      } catch (error) {
        if (isAbort(error)) throw error;
        throw new NetworkError("Could not reach the query endpoint.", {
          cause: error,
        });
      } finally {
        signal.clear();
      }

      let json: unknown;
      try {
        json = await response.json();
      } catch (error) {
        throw new AiProviderError("The query endpoint returned invalid JSON.", {
          cause: error,
        });
      }

      const parsed = SceneQueryResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new AiProviderError(
          "The query endpoint returned an unexpected shape.",
          { cause: parsed.error },
        );
      }
      return parsed.data;
    },
  };
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function combineSignals(
  external: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort(external?.reason);
  if (external) {
    if (external.aborted) controller.abort(external.reason);
    else external.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", onAbort);
    },
  };
}
