import { describe, expect, it } from "vitest";
import type { SceneObservation } from "@/core";
import { deriveAvailability, normalizeSceneObservation } from "./normalize";

const base: SceneObservation = {
  sceneType: "sidewalk",
  pathStatus: "clear",
  terrain: "even",
  overallConfidence: 0.8,
  uncertainty: "low",
  obstacles: [],
  hazards: [],
  recommendedImmediateAction: "continue",
  description: "Clear.",
};

describe("deriveAvailability", () => {
  it("is ok for a confident, low-uncertainty observation", () => {
    expect(deriveAvailability(base)).toBe("ok");
  });

  it("is ambiguous when uncertainty is high", () => {
    expect(deriveAvailability({ ...base, uncertainty: "high" })).toBe(
      "ambiguous",
    );
  });

  it("is ambiguous when overall confidence is very low", () => {
    expect(deriveAvailability({ ...base, overallConfidence: 0.2 })).toBe(
      "ambiguous",
    );
  });
});

describe("normalizeSceneObservation", () => {
  it("adds server identity/freshness and validates the result", () => {
    const result = normalizeSceneObservation(base, {
      capturedAt: 1_700_000_000_000,
      provider: "gemini",
      now: () => 1_700_000_000_500,
      analysisId: () => "22222222-2222-4222-8222-222222222222",
    });
    expect(result.analysisId).toBe("22222222-2222-4222-8222-222222222222");
    expect(result.analyzedAt).toBe(1_700_000_000_500);
    expect(result.capturedAt).toBe(1_700_000_000_000);
    expect(result.provider).toBe("gemini");
    expect(result.availability).toBe("ok");
  });
});
