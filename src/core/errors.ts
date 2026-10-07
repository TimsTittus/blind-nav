import { z } from "zod";
import { NonEmptyStringSchema } from "./primitives";

export const AppErrorCodeSchema = z.enum([
  "permission_denied",
  "unavailable",
  "timeout",
  "network",
  "ai_error",
  "rate_limited",
  "invalid_image",
  "invalid_model_response",
  "unsupported_feature",
]);
export type AppErrorCode = z.infer<typeof AppErrorCodeSchema>;

export type PermissionFeature = "camera" | "geolocation" | "microphone";

export interface AppErrorOptions {
  cause?: unknown;
  retryable?: boolean;
  detail?: string;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly retryable: boolean;
  readonly detail: string | undefined;

  constructor(code: AppErrorCode, message: string, options?: AppErrorOptions) {
    super(
      message,
      options?.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = "AppError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.detail = options?.detail;
  }
}

export class PermissionDeniedError extends AppError {
  readonly feature: PermissionFeature;
  constructor(feature: PermissionFeature, options?: AppErrorOptions) {
    super("permission_denied", `Permission denied for ${feature}.`, {
      retryable: false,
      ...options,
    });
    this.name = "PermissionDeniedError";
    this.feature = feature;
  }
}

export class UnavailableError extends AppError {
  constructor(
    message = "The requested capability is unavailable.",
    options?: AppErrorOptions,
  ) {
    super("unavailable", message, { retryable: true, ...options });
    this.name = "UnavailableError";
  }
}

export class TimeoutError extends AppError {
  constructor(message = "The operation timed out.", options?: AppErrorOptions) {
    super("timeout", message, { retryable: true, ...options });
    this.name = "TimeoutError";
  }
}

export class NetworkError extends AppError {
  constructor(
    message = "A network error occurred.",
    options?: AppErrorOptions,
  ) {
    super("network", message, { retryable: true, ...options });
    this.name = "NetworkError";
  }
}

export class AiProviderError extends AppError {
  constructor(
    message = "The AI provider failed to process the request.",
    options?: AppErrorOptions,
  ) {
    super("ai_error", message, { retryable: true, ...options });
    this.name = "AiProviderError";
  }
}

export class RateLimitedError extends AppError {
  /** Seconds the provider suggested waiting before retrying, if known. */
  readonly retryAfterSeconds: number | undefined;
  constructor(
    message = "The AI provider rate-limited the request.",
    options?: AppErrorOptions & { retryAfterSeconds?: number },
  ) {
    super("rate_limited", message, { retryable: true, ...options });
    this.name = "RateLimitedError";
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }
}

export class InvalidImageError extends AppError {
  constructor(
    message = "The supplied image was missing, malformed, or unsupported.",
    options?: AppErrorOptions,
  ) {
    super("invalid_image", message, { retryable: false, ...options });
    this.name = "InvalidImageError";
  }
}

export class InvalidModelResponseError extends AppError {
  readonly issues: unknown;
  constructor(
    message = "The model returned an invalid response.",
    options?: AppErrorOptions & { issues?: unknown },
  ) {
    super("invalid_model_response", message, { retryable: false, ...options });
    this.name = "InvalidModelResponseError";
    this.issues = options?.issues;
  }

  static fromZodError(
    error: z.ZodError,
    message = "The model returned an invalid response.",
  ): InvalidModelResponseError {
    return new InvalidModelResponseError(message, {
      issues: error.issues,
      cause: error,
    });
  }
}

export class UnsupportedFeatureError extends AppError {
  readonly feature: string;
  constructor(feature: string, options?: AppErrorOptions) {
    super("unsupported_feature", `Unsupported feature: ${feature}.`, {
      retryable: false,
      ...options,
    });
    this.name = "UnsupportedFeatureError";
    this.feature = feature;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export const SerializedAppErrorSchema = z.object({
  code: AppErrorCodeSchema,
  message: NonEmptyStringSchema,
  retryable: z.boolean(),
  detail: NonEmptyStringSchema.optional(),
});
export type SerializedAppError = z.infer<typeof SerializedAppErrorSchema>;

export function toSerializedAppError(error: AppError): SerializedAppError {
  return {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    ...(error.detail !== undefined ? { detail: error.detail } : {}),
  };
}

export function fromSerializedAppError(value: unknown): AppError {
  const { code, message, retryable, detail } =
    SerializedAppErrorSchema.parse(value);
  return new AppError(code, message, {
    retryable,
    ...(detail !== undefined ? { detail } : {}),
  });
}
