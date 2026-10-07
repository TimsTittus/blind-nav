import { describe, expect, it } from "vitest";
import type { SceneAnalysis, SerializedAppError } from "@/core";
import {
  applyAnalysis,
  applyFailure,
  INITIAL_PERCEPTION_STATE,
} from "./perception-state";

function scene(overrides: Partial<SceneAnalysis> = {}): SceneAnalysis {
  return {
    analysisId: "11111111-1111-4111-8111-111111111111",
    capturedAt: 1_700_000_000_000,
    analyzedAt: 1_700_000_000_500,
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
    description: "Clear.",
    ...overrides,
  };
}

const ERROR: SerializedAppError = {
  code: "timeout",
  message: "timed out",
  retryable: true,
};

describe("perception state reducer", () => {
  it("starts honest: unavailable with no analysis", () => {
    expect(INITIAL_PERCEPTION_STATE.status).toBe("unavailable");
    expect(INITIAL_PERCEPTION_STATE.analysis).toBeNull();
  });

  it("applies a fresh analysis and surfaces its availability", () => {
    const next = applyAnalysis(INITIAL_PERCEPTION_STATE, 0, scene(), 120);
    expect(next.status).toBe("ok");
    expect(next.analysis?.pathStatus).toBe("clear");
    expect(next.appliedSequence).toBe(0);
    expect(next.latencyMs).toBe(120);
  });

  it("drops a stale analysis so an old response cannot overwrite a newer one", () => {
    const newer = applyAnalysis(INITIAL_PERCEPTION_STATE, 5, scene(), 100);
    const stale = applyAnalysis(
      newer,
      3,
      scene({ pathStatus: "blocked" }),
      100,
    );
    // Unchanged: the older (seq 3) result is discarded.
    expect(stale).toBe(newer);
    expect(stale.analysis?.pathStatus).toBe("clear");
  });

  it("forces unavailable on failure and clears the last analysis", () => {
    const ok = applyAnalysis(INITIAL_PERCEPTION_STATE, 1, scene(), 100);
    const failed = applyFailure(ok, 2, ERROR, 1_700_000_001_000);
    expect(failed.status).toBe("unavailable");
    expect(failed.analysis).toBeNull();
    expect(failed.lastError).toEqual(ERROR);
  });

  it("drops a stale failure that arrives after a newer success", () => {
    const ok = applyAnalysis(INITIAL_PERCEPTION_STATE, 4, scene(), 100);
    const staleFail = applyFailure(ok, 2, ERROR, 1_700_000_001_000);
    expect(staleFail).toBe(ok);
    expect(staleFail.status).toBe("ok");
  });
});
