import { describe, expect, it } from "vitest";
import { sceneAnalysis } from "@/evaluation/helpers";
import { SafetyEngine } from "./safety-engine";
import type { SafetyContext } from "./types";

const NOW = 1_000_000;

function context(
  scene: Parameters<typeof sceneAnalysis>[0],
  fusion?: SafetyContext["fusion"],
): SafetyContext {
  return {
    sceneAnalysis: sceneAnalysis(scene, NOW - 200, NOW),
    location: null,
    heading: null,
    route: null,
    currentRouteStep: null,
    now: NOW,
    ...(fusion ? { fusion } : {}),
  };
}

describe("SafetyEngine with fused perception", () => {
  const engine = new SafetyEngine();

  it("is unchanged when no fusion metadata is supplied", () => {
    const withoutFusion = engine.assess(context("clear"));
    expect(withoutFusion.assessment.level).toBe("safe");
    expect(withoutFusion.assessment.degraded).toBe(false);
  });

  it("never reports safe when the sources disagree", () => {
    const result = engine.assess(
      context("clear", {
        localOnly: false,
        conflicts: [
          "pathStatus: cloud says clear, local says partially_blocked",
        ],
      }),
    );
    expect(result.assessment.level).toBe("caution");
    expect(result.assessment.action).toBe("continue_cautiously");
  });

  it("explains the disagreement in its reasons", () => {
    const result = engine.assess(
      context("clear", {
        localOnly: false,
        conflicts: [
          "stairs: cloud says no stairs reported, local says stairs detected",
        ],
      }),
    );
    expect(
      result.assessment.reasons.some((r) => r.includes("Perception conflict")),
    ).toBe(true);
    expect(result.assessment.reasons.some((r) => r.includes("stairs"))).toBe(
      true,
    );
  });

  it("marks a conflicted assessment as degraded", () => {
    const result = engine.assess(
      context("clear", { localOnly: false, conflicts: ["pathStatus: x vs y"] }),
    );
    expect(result.assessment.degraded).toBe(true);
  });

  it("enters a conservative warning state on local-only evidence", () => {
    // The brief's case: local CV sees something before the cloud has answered.
    const result = engine.assess(
      context("clear", { localOnly: true, conflicts: [] }),
    );
    expect(result.assessment.level).toBe("caution");
    expect(result.assessment.degraded).toBe(true);
    expect(
      result.assessment.reasons.some((r) =>
        r.includes("Cloud perception unavailable"),
      ),
    ).toBe(true);
  });

  it("does not downgrade a real hazard to caution", () => {
    // Fusion metadata must only ever raise the floor, never lower the ceiling.
    const plain = engine.assess(context("blocked"));
    const fused = engine.assess(
      context("blocked", {
        localOnly: true,
        conflicts: ["pathStatus: a vs b"],
      }),
    );
    expect(fused.assessment.level).toBe(plain.assessment.level);
  });

  it("leaves agreeing sources at their normal level", () => {
    const result = engine.assess(
      context("clear", { localOnly: false, conflicts: [] }),
    );
    expect(result.assessment.level).toBe("safe");
    expect(result.assessment.degraded).toBe(false);
  });

  it("still reports unknown when there is no scene at all", () => {
    const result = engine.assess({
      sceneAnalysis: null,
      location: null,
      heading: null,
      route: null,
      currentRouteStep: null,
      now: NOW,
      fusion: { localOnly: false, conflicts: [] },
    });
    expect(result.assessment.level).toBe("unknown");
    expect(result.assessment.degraded).toBe(true);
  });
});
