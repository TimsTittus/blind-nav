import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AppError,
  fromSerializedAppError,
  InvalidModelResponseError,
  isAppError,
  PermissionDeniedError,
  SerializedAppErrorSchema,
  TimeoutError,
  toSerializedAppError,
  UnsupportedFeatureError,
} from "./errors";

describe("typed application errors", () => {
  it("PermissionDeniedError carries code, feature, and is non-retryable", () => {
    const err = new PermissionDeniedError("camera");
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("permission_denied");
    expect(err.feature).toBe("camera");
    expect(err.retryable).toBe(false);
  });

  it("TimeoutError is retryable", () => {
    expect(new TimeoutError().retryable).toBe(true);
    expect(new TimeoutError().code).toBe("timeout");
  });

  it("UnsupportedFeatureError names the missing feature", () => {
    const err = new UnsupportedFeatureError("Geolocation");
    expect(err.code).toBe("unsupported_feature");
    expect(err.feature).toBe("Geolocation");
  });

  it("InvalidModelResponseError wraps a ZodError's issues", () => {
    const parsed = z.object({ ok: z.boolean() }).safeParse({ ok: "no" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const err = InvalidModelResponseError.fromZodError(parsed.error);
    expect(err.code).toBe("invalid_model_response");
    expect(err.retryable).toBe(false);
    expect(Array.isArray(err.issues)).toBe(true);
    expect(err.cause).toBe(parsed.error);
  });

  it("isAppError distinguishes app errors from plain errors", () => {
    expect(isAppError(new TimeoutError())).toBe(true);
    expect(isAppError(new Error("x"))).toBe(false);
    expect(isAppError("nope")).toBe(false);
  });
});

describe("error serialization", () => {
  it("round-trips an error through its wire form", () => {
    const original = new UnsupportedFeatureError("SpeechSynthesis", {
      detail: "No TTS engine",
    });
    const wire = toSerializedAppError(original);
    expect(wire).toEqual({
      code: "unsupported_feature",
      message: "Unsupported feature: SpeechSynthesis.",
      retryable: false,
      detail: "No TTS engine",
    });

    const restored = fromSerializedAppError(wire);
    expect(restored).toBeInstanceOf(AppError);
    expect(restored.code).toBe("unsupported_feature");
    expect(restored.detail).toBe("No TTS engine");
  });

  it("rejects a malformed wire payload", () => {
    expect(
      SerializedAppErrorSchema.safeParse({
        code: "boom",
        message: "x",
        retryable: true,
      }).success,
    ).toBe(false);
    expect(() => fromSerializedAppError({ code: "boom" })).toThrow();
  });
});
