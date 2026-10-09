import { describe, expect, it } from "vitest";
import type { FastPerceptionFrame, SceneAnalysis } from "@/core";
import { NO_FAST_ANSWERS } from "@/core";
import {
  CONSERVATIVE_TRUST_POLICY,
  FIXTURE_GRIDS,
  readSegmentation,
} from "@/fast-perception";
import { sceneAnalysis, TEST_UUID } from "@/evaluation/helpers";
import { fusePerception } from "./fuse";

const NOW = 1_000_000;
const ID = () => TEST_UUID;

function localFrame(
  scene: keyof typeof FIXTURE_GRIDS,
  producedAt = NOW,
): FastPerceptionFrame {
  const reading = readSegmentation(FIXTURE_GRIDS[scene], 0.6);
  return {
    sequence: 1,
    capturedAt: producedAt - 10,
    producedAt,
    availability: "ok",
    answers: reading.answers,
    obstacles: reading.obstacles,
    inferenceMs: 30,
    backend: "test",
    modelId: "test-model",
  };
}

function emptyLocal(producedAt = NOW): FastPerceptionFrame {
  return {
    sequence: 1,
    capturedAt: producedAt - 10,
    producedAt,
    availability: "ok",
    answers: { ...NO_FAST_ANSWERS, somethingAhead: false, blocked: false },
    obstacles: [],
    inferenceMs: 30,
    backend: "test",
    modelId: "test-model",
  };
}

function fuse(cloud: SceneAnalysis | null, local: FastPerceptionFrame | null) {
  return fusePerception({
    cloud,
    local,
    policy: CONSERVATIVE_TRUST_POLICY,
    now: NOW,
    analysisId: ID,
  });
}

describe("fusePerception — modes", () => {
  it("is cloud_only when there is no local evidence", () => {
    const result = fuse(sceneAnalysis("clear", NOW - 200, NOW), null);
    expect(result.mode).toBe("cloud_only");
    expect(result.analysis?.provider).toBe("fixture");
  });

  it("is local_only when the cloud has not answered yet", () => {
    const result = fuse(null, localFrame("stairs"));
    expect(result.mode).toBe("local_only");
    expect(result.analysis?.provider).toBe("local");
  });

  it("is local_only when the cloud result is stale", () => {
    const stale = sceneAnalysis("clear", NOW - 20_000, NOW - 10_000);
    const result = fuse(stale, localFrame("stairs"));
    expect(result.mode).toBe("local_only");
  });

  it("is none when neither source is usable", () => {
    const result = fuse(null, null);
    expect(result.mode).toBe("none");
    expect(result.analysis).toBeNull();
  });

  it("ignores a stale local frame rather than using old evidence", () => {
    const result = fuse(
      sceneAnalysis("clear", NOW - 200, NOW),
      localFrame("blocked", NOW - 5_000),
    );
    expect(result.mode).toBe("cloud_only");
  });

  it("ignores a local frame that failed", () => {
    const broken = { ...localFrame("blocked"), availability: "error" as const };
    const result = fuse(sceneAnalysis("clear", NOW - 200, NOW), broken);
    expect(result.mode).toBe("cloud_only");
  });

  it("ignores an errored cloud analysis", () => {
    const errored: SceneAnalysis = {
      ...sceneAnalysis("clear", NOW - 200, NOW),
      availability: "error",
    };
    const result = fuse(errored, localFrame("stairs"));
    expect(result.mode).toBe("local_only");
  });
});

describe("fusePerception — local evidence can only add risk", () => {
  it("worsens a clear cloud path when local sees something", () => {
    const cloud = sceneAnalysis("clear", NOW - 200, NOW);
    expect(cloud.pathStatus).toBe("clear");
    const result = fuse(cloud, localFrame("obstacle"));
    expect(result.analysis?.pathStatus).toBe("partially_blocked");
  });

  it("never improves a blocked cloud path when local sees nothing", () => {
    const cloud = sceneAnalysis("blocked", NOW - 200, NOW);
    const result = fuse(cloud, emptyLocal());
    expect(result.analysis?.pathStatus).toBe(cloud.pathStatus);
  });

  it("keeps every cloud obstacle and hazard", () => {
    const cloud = sceneAnalysis("blocked", NOW - 200, NOW);
    const result = fuse(cloud, localFrame("stairs"));
    expect(result.analysis?.obstacles.length).toBeGreaterThanOrEqual(
      cloud.obstacles.length,
    );
    for (const hazard of cloud.hazards) {
      expect(result.analysis?.hazards).toContainEqual(hazard);
    }
  });

  it("never raises cloud confidence", () => {
    const cloud = sceneAnalysis("uncertain", NOW - 200, NOW);
    const result = fuse(cloud, localFrame("obstacle"));
    expect(result.analysis?.overallConfidence).toBeLessThanOrEqual(
      cloud.overallConfidence,
    );
  });

  it("never lowers cloud uncertainty", () => {
    const cloud = sceneAnalysis("uncertain", NOW - 200, NOW);
    const ranks = { low: 0, medium: 1, high: 2 };
    const result = fuse(cloud, localFrame("obstacle"));
    expect(ranks[result.analysis!.uncertainty]).toBeGreaterThanOrEqual(
      ranks[cloud.uncertainty],
    );
  });

  it("keeps the cloud's recommended action, never the local model's", () => {
    const cloud = sceneAnalysis("blocked", NOW - 200, NOW);
    const result = fuse(cloud, localFrame("stairs"));
    expect(result.analysis?.recommendedImmediateAction).toBe(
      cloud.recommendedImmediateAction,
    );
  });

  it("keeps the cloud's description and terrain", () => {
    const cloud = sceneAnalysis("puddle", NOW - 200, NOW);
    const result = fuse(cloud, localFrame("stairs"));
    expect(result.analysis?.description).toBe(cloud.description);
    expect(result.analysis?.terrain).toBe(cloud.terrain);
  });

  it("caps merged obstacles and hazards at the schema limit", () => {
    const many = Array.from({ length: 20 }, () => ({
      type: "other" as const,
      position: "center" as const,
      relativeDistance: "near" as const,
      severity: "medium" as const,
      confidence: 0.5,
      movement: "unknown" as const,
    }));
    const cloud: SceneAnalysis = {
      ...sceneAnalysis("obstacle", NOW - 200, NOW),
      obstacles: many,
    };
    const result = fuse(cloud, localFrame("obstacle"));
    expect(result.analysis?.obstacles.length).toBeLessThanOrEqual(20);
  });
});

describe("fusePerception — conflict is explicit", () => {
  it("records a path disagreement instead of silently resolving it", () => {
    const result = fuse(
      sceneAnalysis("clear", NOW - 200, NOW),
      localFrame("obstacle"),
    );
    const conflict = result.conflicts.find((c) => c.question === "pathStatus");
    expect(conflict).toBeDefined();
    expect(conflict?.cloud).toBe("clear");
    expect(conflict?.local).toBe("partially_blocked");
    expect(conflict?.resolution).toBe("took_more_cautious");
  });

  it("records stairs the cloud did not report", () => {
    const result = fuse(
      sceneAnalysis("clear", NOW - 200, NOW),
      localFrame("stairs"),
    );
    expect(result.conflicts.some((c) => c.question === "stairs")).toBe(true);
  });

  it("does not report a stairs conflict when the cloud already sees steps", () => {
    const result = fuse(
      sceneAnalysis("stairs", NOW - 200, NOW),
      localFrame("stairs"),
    );
    expect(result.conflicts.some((c) => c.question === "stairs")).toBe(false);
  });

  it("reports no conflict when the sources agree", () => {
    const result = fuse(sceneAnalysis("clear", NOW - 200, NOW), emptyLocal());
    expect(result.conflicts).toHaveLength(0);
  });

  it("reports no conflict when only one source is usable", () => {
    expect(fuse(null, localFrame("blocked")).conflicts).toHaveLength(0);
    expect(
      fuse(sceneAnalysis("clear", NOW - 200, NOW), null).conflicts,
    ).toHaveLength(0);
  });
});

describe("fusePerception — source metadata", () => {
  it("reports age, confidence and freshness per source", () => {
    const result = fuse(
      sceneAnalysis("clear", NOW - 1_200, NOW - 1_000),
      localFrame("obstacle", NOW - 100),
    );
    const cloud = result.sources.find((s) => s.source === "cloud");
    const local = result.sources.find((s) => s.source === "local");
    expect(cloud?.ageMs).toBe(1_000);
    expect(cloud?.fresh).toBe(true);
    expect(local?.ageMs).toBe(100);
    expect(local?.contributed).toBe(true);
    expect(local?.id).toBe("test-model");
  });

  it("marks a stale source as not contributing but still reports its age", () => {
    const result = fuse(
      sceneAnalysis("clear", NOW - 20_000, NOW - 10_000),
      localFrame("stairs"),
    );
    const cloud = result.sources.find((s) => s.source === "cloud");
    expect(cloud?.contributed).toBe(false);
    expect(cloud?.ageMs).toBe(10_000);
  });

  it("does not prefer a source by identity — only freshness and caution", () => {
    // Same scenes, opposite directions: whichever is more cautious wins.
    const cautiousCloud = fuse(
      sceneAnalysis("blocked", NOW - 200, NOW),
      emptyLocal(),
    );
    const cautiousLocal = fuse(
      sceneAnalysis("clear", NOW - 200, NOW),
      localFrame("obstacle"),
    );
    expect(cautiousCloud.analysis?.pathStatus).toBe("blocked");
    expect(cautiousLocal.analysis?.pathStatus).toBe("partially_blocked");
  });
});
