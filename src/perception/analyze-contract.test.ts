import { describe, expect, it } from "vitest";
import {
  AnalyzeRequestSchema,
  AnalyzeResponseSchema,
} from "./analyze-contract";

describe("AnalyzeRequestSchema", () => {
  it("accepts a well-formed request", () => {
    expect(
      AnalyzeRequestSchema.safeParse({
        frame: { dataUrl: "data:image/jpeg;base64,AAAA", capturedAt: 1 },
        sequence: 0,
        context: { mode: "navigate" },
      }).success,
    ).toBe(true);
  });

  it("rejects a negative sequence", () => {
    expect(
      AnalyzeRequestSchema.safeParse({
        frame: { dataUrl: "data:,", capturedAt: 1 },
        sequence: -1,
      }).success,
    ).toBe(false);
  });

  it("rejects a non-data-URL frame", () => {
    expect(
      AnalyzeRequestSchema.safeParse({
        frame: { dataUrl: "http://x/y.jpg", capturedAt: 1 },
        sequence: 0,
      }).success,
    ).toBe(false);
  });
});

describe("AnalyzeResponseSchema", () => {
  const analysis = {
    analysisId: "11111111-1111-4111-8111-111111111111",
    capturedAt: 1,
    analyzedAt: 2,
    availability: "ok",
    provider: "fixture",
    sceneType: "sidewalk",
    pathStatus: "clear",
    terrain: "even",
    overallConfidence: 0.8,
    uncertainty: "low",
    obstacles: [],
    hazards: [],
    recommendedImmediateAction: "continue",
    description: "x",
  };

  it("accepts a success variant", () => {
    expect(
      AnalyzeResponseSchema.safeParse({
        ok: true,
        sequence: 1,
        analysis,
        latencyMs: 100,
      }).success,
    ).toBe(true);
  });

  it("accepts a failure variant with unavailable status", () => {
    expect(
      AnalyzeResponseSchema.safeParse({
        ok: false,
        sequence: 1,
        error: { code: "timeout", message: "slow", retryable: true },
        perceptionStatus: "unavailable",
      }).success,
    ).toBe(true);
  });

  it("rejects a failure that claims a status other than unavailable", () => {
    expect(
      AnalyzeResponseSchema.safeParse({
        ok: false,
        sequence: 1,
        error: { code: "timeout", message: "slow", retryable: true },
        perceptionStatus: "ok",
      }).success,
    ).toBe(false);
  });
});
