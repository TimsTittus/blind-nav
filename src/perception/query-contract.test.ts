import { describe, expect, it } from "vitest";
import {
  SceneQueryRequestSchema,
  SceneQueryResponseSchema,
  isSceneQuerySuccess,
} from "./query-contract";

describe("SceneQueryRequestSchema", () => {
  it("accepts a valid request", () => {
    const result = SceneQueryRequestSchema.safeParse({
      frame: {
        dataUrl: "data:image/jpeg;base64,abc123",
        capturedAt: Date.now(),
      },
      question: "What is ahead?",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty question", () => {
    const result = SceneQueryRequestSchema.safeParse({
      frame: {
        dataUrl: "data:image/jpeg;base64,abc123",
        capturedAt: Date.now(),
      },
      question: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects question over 500 chars", () => {
    const result = SceneQueryRequestSchema.safeParse({
      frame: {
        dataUrl: "data:image/jpeg;base64,abc123",
        capturedAt: Date.now(),
      },
      question: "x".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing frame", () => {
    const result = SceneQueryRequestSchema.safeParse({
      question: "What is ahead?",
    });
    expect(result.success).toBe(false);
  });
});

describe("SceneQueryResponseSchema", () => {
  it("accepts a success response", () => {
    const result = SceneQueryResponseSchema.safeParse({
      ok: true,
      answer: "A wall.",
      queriedAt: Date.now(),
      latencyMs: 100,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a failure response", () => {
    const result = SceneQueryResponseSchema.safeParse({
      ok: false,
      error: {
        code: "ai_error",
        message: "Failed",
        retryable: true,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("isSceneQuerySuccess", () => {
  it("returns true for success", () => {
    expect(
      isSceneQuerySuccess({
        ok: true,
        answer: "test",
        queriedAt: 0,
        latencyMs: 0,
      }),
    ).toBe(true);
  });

  it("returns false for failure", () => {
    expect(
      isSceneQuerySuccess({
        ok: false,
        error: { code: "ai_error", message: "x", retryable: false },
      }),
    ).toBe(false);
  });
});
