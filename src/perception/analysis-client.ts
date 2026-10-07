import { AiProviderError, NetworkError } from "@/core";
import type { AnalyzeFrameContext } from "@/providers";
import {
  type AnalyzeResponse,
  AnalyzeResponseSchema,
} from "./analyze-contract";
import { ANALYZE_ENDPOINT, DEFAULT_ANALYZE_TIMEOUT_MS } from "./config";

export interface AnalyzeClientRequest {
  dataUrl: string;
  capturedAt: number;
  sequence: number;
  width?: number;
  height?: number;
  context?: AnalyzeFrameContext;
  signal?: AbortSignal;
}

export interface AnalysisClientOptions {
  endpoint?: string;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export interface AnalysisClient {
  analyze(request: AnalyzeClientRequest): Promise<AnalyzeResponse>;
}

/**
 * Posts a frame to the analyze endpoint and returns the validated response.
 * Transport/HTTP failures and malformed bodies are thrown as typed errors so
 * the caller can mark perception unavailable; a well-formed `{ ok: false }`
 * response is returned as-is.
 */
export function createAnalysisClient(
  options: AnalysisClientOptions = {},
): AnalysisClient {
  const endpoint = options.endpoint ?? ANALYZE_ENDPOINT;
  const doFetch = options.fetchFn ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_ANALYZE_TIMEOUT_MS;

  return {
    async analyze(request) {
      const body = JSON.stringify({
        frame: {
          dataUrl: request.dataUrl,
          capturedAt: request.capturedAt,
          ...(request.width !== undefined ? { width: request.width } : {}),
          ...(request.height !== undefined ? { height: request.height } : {}),
        },
        sequence: request.sequence,
        ...(request.context ? { context: request.context } : {}),
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
        throw new NetworkError("Could not reach the analyze endpoint.", {
          cause: error,
        });
      } finally {
        signal.clear();
      }

      let json: unknown;
      try {
        json = await response.json();
      } catch (error) {
        throw new AiProviderError(
          "The analyze endpoint returned invalid JSON.",
          {
            cause: error,
          },
        );
      }

      const parsed = AnalyzeResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new AiProviderError(
          "The analyze endpoint returned an unexpected shape.",
          { cause: parsed.error },
        );
      }
      return parsed.data;
    },
  };
}

/** Encode a captured frame Blob as a base64 `data:` URL in the browser. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read frame."));
    reader.readAsDataURL(blob);
  });
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
