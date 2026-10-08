import {
  type AppError,
  type AppErrorCode,
  InvalidImageError,
  UnsupportedFeatureError,
  isAppError,
  toSerializedAppError,
  UnavailableError,
} from "@/core";
import { decodeImageDataUrl } from "@/perception";
import type {
  SceneQueryFailure,
  SceneQueryResponse,
  SceneQuerySuccess,
} from "@/perception/query-contract";
import { SceneQueryRequestSchema } from "@/perception/query-contract";
import type { VisionProvider } from "@/providers";

export interface QueryHandlerDeps {
  resolveProvider: (options: { useFixtures: boolean }) => VisionProvider;
  now?: () => number;
  timeoutMs?: number;
}

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  invalid_image: 400,
  rate_limited: 429,
  timeout: 504,
  unavailable: 503,
  ai_error: 502,
  network: 502,
  invalid_model_response: 502,
  permission_denied: 500,
  unsupported_feature: 500,
};

export function createQueryHandler(
  deps: QueryHandlerDeps,
): (request: Request) => Promise<Response> {
  const now = deps.now ?? Date.now;

  return async function POST(request: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return failure(new InvalidImageError("The request body must be JSON."));
    }

    const parsed = SceneQueryRequestSchema.safeParse(body);
    if (!parsed.success) {
      const detail = parsed.error.issues[0]?.message;
      return failure(
        new InvalidImageError(
          "The request was malformed.",
          detail !== undefined ? { detail } : undefined,
        ),
      );
    }
    const req = parsed.data;

    try {
      decodeImageDataUrl(req.frame.dataUrl);
    } catch (error) {
      return failure(toAppError(error));
    }

    const { useFixtures } = parseQuery(request.url);

    let provider: VisionProvider;
    try {
      provider = deps.resolveProvider({ useFixtures });
    } catch (error) {
      return failure(toAppError(error));
    }

    if (!provider.queryScene) {
      return failure(
        new UnsupportedFeatureError(
          "Scene queries are not supported by this provider.",
        ),
      );
    }

    const startedAt = now();
    try {
      const result = await provider.queryScene(
        { frame: req.frame, question: req.question },
        deps.timeoutMs !== undefined
          ? { timeoutMs: deps.timeoutMs }
          : undefined,
      );
      const latencyMs = Math.max(0, now() - startedAt);
      const payload: SceneQuerySuccess = {
        ok: true,
        answer: result.answer,
        queriedAt: result.queriedAt,
        latencyMs,
      };
      return json(payload, 200);
    } catch (error) {
      return failure(toAppError(error));
    }
  };

  function failure(error: AppError): Response {
    const payload: SceneQueryFailure = {
      ok: false,
      error: toSerializedAppError(error),
    };
    return json(payload, STATUS_BY_CODE[error.code] ?? 500);
  }
}

function json(payload: SceneQueryResponse, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function toAppError(error: unknown): AppError {
  return isAppError(error)
    ? error
    : new UnavailableError("The query failed unexpectedly.", {
        cause: error,
      });
}

function parseQuery(url: string): { useFixtures: boolean } {
  try {
    const params = new URL(url).searchParams;
    return { useFixtures: params.get("provider") === "fixture" };
  } catch {
    return { useFixtures: false };
  }
}
