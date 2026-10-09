import { describe, expect, it } from "vitest";
import type { FastAnswers, FastPerceptionFrame } from "@/core";
import { NO_FAST_ANSWERS } from "@/core";
import { readSegmentation } from "./answers";
import { FIXTURE_GRIDS } from "./grid-builders";
import { toSceneObservation } from "./to-observation";
import {
  CONSERVATIVE_TRUST_POLICY,
  mayEscalate,
  STAIRS_ONLY_TRUST_POLICY,
  type FastTrustPolicy,
} from "./trust-policy";

function frameWith(
  answers: Partial<FastAnswers>,
  obstacles: FastPerceptionFrame["obstacles"] = [],
): FastPerceptionFrame {
  return {
    sequence: 0,
    capturedAt: 1_000,
    producedAt: 1_010,
    availability: "ok",
    answers: { ...NO_FAST_ANSWERS, ...answers },
    obstacles,
    inferenceMs: 12,
    backend: "test",
    modelId: "test-model",
  };
}

function fromGrid(
  scene: keyof typeof FIXTURE_GRIDS,
  policy: FastTrustPolicy = CONSERVATIVE_TRUST_POLICY,
) {
  const reading = readSegmentation(FIXTURE_GRIDS[scene], policy.maxConfidence);
  return toSceneObservation(
    frameWith(reading.answers, reading.obstacles),
    policy,
  );
}

describe("trust policy", () => {
  it("never allows questions that would lower risk to escalate", () => {
    const permissive: FastTrustPolicy = {
      escalate: ["sidewalk", "traversable", "stairs"],
      allowBlockedAssertion: true,
      maxConfidence: 0.6,
    };
    expect(mayEscalate(permissive, "sidewalk")).toBe(false);
    expect(mayEscalate(permissive, "traversable")).toBe(false);
    expect(mayEscalate(permissive, "stairs")).toBe(true);
  });

  it("does not let the default policy assert a blocked path", () => {
    expect(CONSERVATIVE_TRUST_POLICY.allowBlockedAssertion).toBe(false);
  });
});

describe("toSceneObservation", () => {
  it("never reports the path as clear", () => {
    for (const scene of Object.keys(
      FIXTURE_GRIDS,
    ) as (keyof typeof FIXTURE_GRIDS)[]) {
      expect(fromGrid(scene).pathStatus).not.toBe("clear");
    }
  });

  it("reports unknown, not clear, when there is no evidence", () => {
    const observation = toSceneObservation(
      frameWith({ somethingAhead: false, blocked: false, traversable: true }),
      CONSERVATIVE_TRUST_POLICY,
    );
    expect(observation.pathStatus).toBe("unknown");
    expect(observation.description).toContain("does not confirm");
  });

  it("never recommends an action: the Safety Engine decides", () => {
    for (const scene of Object.keys(
      FIXTURE_GRIDS,
    ) as (keyof typeof FIXTURE_GRIDS)[]) {
      expect(fromGrid(scene).recommendedImmediateAction).toBe("unknown");
    }
  });

  it("never reports terrain it cannot see", () => {
    for (const scene of Object.keys(
      FIXTURE_GRIDS,
    ) as (keyof typeof FIXTURE_GRIDS)[]) {
      expect(fromGrid(scene).terrain).toBe("unknown");
    }
  });

  it("never reports low uncertainty", () => {
    for (const scene of Object.keys(
      FIXTURE_GRIDS,
    ) as (keyof typeof FIXTURE_GRIDS)[]) {
      expect(fromGrid(scene).uncertainty).not.toBe("low");
    }
  });

  it("caps blocked at partially_blocked under the default policy", () => {
    // The raw reading says blocked; the policy refuses to assert it.
    const reading = readSegmentation(FIXTURE_GRIDS.blocked, 0.6);
    expect(reading.answers.blocked).toBe(true);
    expect(fromGrid("blocked").pathStatus).toBe("partially_blocked");
  });

  it("asserts blocked only when a policy explicitly allows it", () => {
    const permissive: FastTrustPolicy = {
      escalate: ["somethingAhead", "stairs", "largeObstacle", "blocked"],
      allowBlockedAssertion: true,
      maxConfidence: 0.6,
    };
    expect(fromGrid("blocked", permissive).pathStatus).toBe("blocked");
  });

  it("raises a step hazard for stairs under the default policy", () => {
    const observation = fromGrid("stairs");
    expect(observation.hazards.some((h) => h.type === "step")).toBe(true);
    expect(observation.sceneType).toBe("stairway");
  });

  it("drops stairs evidence entirely when the policy does not trust it", () => {
    const noStairs: FastTrustPolicy = {
      escalate: ["somethingAhead"],
      allowBlockedAssertion: false,
      maxConfidence: 0.6,
    };
    const observation = fromGrid("stairs", noStairs);
    expect(observation.hazards).toHaveLength(0);
    expect(observation.obstacles.some((o) => o.type === "stairs")).toBe(false);
  });

  it("under the stairs-only policy, ignores everything except stairs", () => {
    // Obstacles the stairs-only policy does not trust must not raise risk.
    expect(fromGrid("obstacle", STAIRS_ONLY_TRUST_POLICY).pathStatus).toBe(
      "unknown",
    );
    expect(fromGrid("stairs", STAIRS_ONLY_TRUST_POLICY).pathStatus).toBe(
      "partially_blocked",
    );
  });

  it("treats sidewalk as scene type only, never as reduced risk", () => {
    const observation = toSceneObservation(
      frameWith({ sidewalk: true, somethingAhead: true }),
      CONSERVATIVE_TRUST_POLICY,
    );
    expect(observation.sceneType).toBe("sidewalk");
    expect(observation.pathStatus).toBe("partially_blocked");
  });

  it("never claims a distance more urgent than near", () => {
    for (const scene of Object.keys(
      FIXTURE_GRIDS,
    ) as (keyof typeof FIXTURE_GRIDS)[]) {
      for (const obstacle of fromGrid(scene).obstacles) {
        expect(obstacle.relativeDistance).not.toBe("very_near");
      }
    }
  });

  it("caps overall confidence at the policy maximum", () => {
    expect(fromGrid("blocked").overallConfidence).toBe(
      CONSERVATIVE_TRUST_POLICY.maxConfidence,
    );
  });
});
