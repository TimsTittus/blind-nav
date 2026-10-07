import type { z } from "zod";
import {
  AiProviderError,
  type AppError,
  InvalidImageError,
  InvalidModelResponseError,
  isAppError,
  NetworkError,
  RateLimitedError,
  TimeoutError,
} from "@/core";

export {
  AiProviderError,
  InvalidImageError,
  InvalidModelResponseError,
  NetworkError,
  RateLimitedError,
  TimeoutError,
} from "@/core";

export function invalidModelResponse(
  error: z.ZodError,
  message?: string,
): InvalidModelResponseError {
  return InvalidModelResponseError.fromZodError(error, message);
}

/** Structural view of an SDK/HTTP error, so we need not import the SDK here. */
interface MaybeHttpError {
  name?: unknown;
  message?: unknown;
  status?: unknown;
}

function asHttpError(error: unknown): MaybeHttpError {
  return typeof error === "object" && error !== null
    ? (error as MaybeHttpError)
    : {};
}

/**
 * Map an arbitrary provider/SDK/network failure onto the typed error taxonomy.
 * The project-named error states map as:
 * - `AI_TIMEOUT`       → {@link TimeoutError}         (aborted / 408 / 504)
 * - `AI_RATE_LIMITED`  → {@link RateLimitedError}     (429)
 * - `NETWORK_ERROR`    → {@link NetworkError}         (fetch/transport failure)
 * - `AI_UNAVAILABLE`   → {@link AiProviderError}      (5xx and anything else)
 *
 * `INVALID_AI_RESPONSE` ({@link InvalidModelResponseError}) and `INVALID_IMAGE`
 * ({@link InvalidImageError}) are raised explicitly at the validation
 * boundaries, not here. Already-typed {@link AppError}s pass through unchanged.
 */
export function mapProviderError(error: unknown): AppError {
  if (isAppError(error)) return error;

  const http = asHttpError(error);
  const name = typeof http.name === "string" ? http.name : "";
  const message = typeof http.message === "string" ? http.message : undefined;

  if (name === "AbortError" || name === "TimeoutError") {
    return new TimeoutError("The AI request was aborted or timed out.", {
      cause: error,
    });
  }

  if (typeof http.status === "number") {
    const status = http.status;
    if (status === 429) {
      return new RateLimitedError(message, { cause: error });
    }
    if (status === 408 || status === 504) {
      return new TimeoutError(message ?? "The AI request timed out.", {
        cause: error,
      });
    }
    // 5xx (and any other unexpected HTTP status) → provider unavailable.
    return new AiProviderError(message ?? "The AI provider is unavailable.", {
      cause: error,
    });
  }

  // Fetch/transport failures surface as a TypeError with no HTTP status.
  if (name === "TypeError") {
    return new NetworkError(message ?? "A network error occurred.", {
      cause: error,
    });
  }

  return new AiProviderError(
    message ?? "The AI provider failed to process the request.",
    { cause: error },
  );
}

/** Convenience guard used by callers that only care whether it is an image error. */
export function invalidImage(
  message?: string,
  detail?: string,
): InvalidImageError {
  return new InvalidImageError(message, detail ? { detail } : undefined);
}
