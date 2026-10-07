import {
  type AppError,
  type AppErrorCode,
  InvalidImageError,
  isAppError,
  toSerializedAppError,
  UnavailableError,
} from "@/core";
import {
  type AnalyzeFailure,
  type AnalyzeResponse,
  type AnalyzeSuccess,
  AnalyzeRequestSchema,
  decodeImageDataUrl,
} from "@/perception";
import type { AnalyzeFrameContext, VisionProvider } from "@/providers";

export interface AnalyzeHandlerDeps {
  /** Resolve the provider for this request (fixtures vs. real). */
  resolveProvider: (options: { useFixtures: boolean }) => VisionProvider;
  now?: () => number;
  /** Per-request budget passed to the provider. */
  timeoutMs?: number;
}

/** Map a typed error code to an HTTP status for the response. */
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

/**
 * Build the POST handler for `/api/vision/analyze`.
 *
 * Pipeline: parse body → validate request → validate image (MIME + size) →
 * resolve provider → analyze → the provider validates+normalizes the model
 * output with Zod → return a typed `SceneAnalysis`. Every failure returns a
 * typed error with `perceptionStatus: "unavailable"` — never a silent
 * "path clear".
 */
export function createAnalyzeHandler(
  deps: AnalyzeHandlerDeps,
): (request: Request) => Promise<Response> {
  const now = deps.now ?? Date.now;

  return async function POST(request: Request): Promise<Response> {
    // Parse the JSON body. A non-JSON body is malformed input.
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return failure(
        new InvalidImageError("The request body must be JSON."),
        0,
      );
    }

    const sequence = extractSequence(body);

    const parsed = AnalyzeRequestSchema.safeParse(body);
    if (!parsed.success) {
      const detail = parsed.error.issues[0]?.message;
      return failure(
        new InvalidImageError(
          "The request was malformed.",
          detail !== undefined ? { detail } : undefined,
        ),
        sequence,
      );
    }
    const req = parsed.data;

    // Image trust boundary: reject bad MIME / size before any model call.
    try {
      decodeImageDataUrl(req.frame.dataUrl);
    } catch (error) {
      return failure(toAppError(error), req.sequence);
    }

    const { useFixtures, scenario } = parseQuery(request.url);
    const context = withScenario(req.context, scenario);

    let provider: VisionProvider;
    try {
      provider = deps.resolveProvider({ useFixtures });
    } catch (error) {
      return failure(toAppError(error), req.sequence);
    }

    const startedAt = now();
    try {
      const analysis = await provider.analyzeFrame(
        { frame: req.frame, ...(context ? { context } : {}) },
        deps.timeoutMs !== undefined
          ? { timeoutMs: deps.timeoutMs }
          : undefined,
      );
      const latencyMs = Math.max(0, now() - startedAt);
      const payload: AnalyzeSuccess = {
        ok: true,
        sequence: req.sequence,
        analysis,
        latencyMs,
      };
      return json(payload, 200);
    } catch (error) {
      return failure(toAppError(error), req.sequence);
    }
  };

  function failure(error: AppError, sequence: number): Response {
    const payload: AnalyzeFailure = {
      ok: false,
      sequence,
      error: toSerializedAppError(error),
      perceptionStatus: "unavailable",
    };
    return json(payload, STATUS_BY_CODE[error.code] ?? 500);
  }
}

function json(payload: AnalyzeResponse, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function toAppError(error: unknown): AppError {
  return isAppError(error)
    ? error
    : new UnavailableError("The analysis failed unexpectedly.", {
        cause: error,
      });
}

/** Best-effort sequence recovery so even a rejected request echoes one. */
function extractSequence(body: unknown): number {
  if (
    typeof body === "object" &&
    body !== null &&
    "sequence" in body &&
    typeof (body as { sequence: unknown }).sequence === "number" &&
    Number.isInteger((body as { sequence: number }).sequence) &&
    (body as { sequence: number }).sequence >= 0
  ) {
    return (body as { sequence: number }).sequence;
  }
  return 0;
}

function parseQuery(url: string): {
  useFixtures: boolean;
  scenario: string | undefined;
} {
  try {
    const params = new URL(url).searchParams;
    return {
      useFixtures: params.get("provider") === "fixture",
      scenario: params.get("scenario") ?? undefined,
    };
  } catch {
    return { useFixtures: false, scenario: undefined };
  }
}

/** Fold a dev `?scenario=` hint into the context (defaulting mode to navigate). */
function withScenario(
  context: AnalyzeFrameContext | undefined,
  scenario: string | undefined,
): AnalyzeFrameContext | undefined {
  if (!scenario) return context;
  return { mode: context?.mode ?? "navigate", ...context, scenario };
}
