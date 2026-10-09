/**
 * Phase 14: cloud-only vs local-only vs hybrid.
 *
 * Each of the 16 fixture scenes is run through all three perception
 * configurations and then through the **real deterministic Safety Engine**, and
 * scored against the Phase-11 `SAFETY_FLOOR` and `MUST_NOT_BE_SAFE` contracts.
 *
 * ## What this measures, and what it does not
 *
 * Measured here, deterministically:
 * - **False negatives** — scenes landing below their safety floor (a missed
 *   hazard; the error direction that hurts the user).
 * - **False positives** — `danger`/`critical` on a scene whose floor is
 *   `safe`/`caution` (an unnecessary stop; the error direction that teaches
 *   users to ignore the system).
 * - **Floor compliance** and `MUST_NOT_BE_SAFE` violations.
 * - **Conflict rate** between the two sources.
 * - **Modelled time-to-first-warning** from the configured loop intervals.
 *
 * **Not** measured here, and not claimed anywhere:
 * - Real inference latency, CPU, GPU, memory or battery. Those need a real
 *   device; `docs/local-cv-evaluation.md` §4 has the laptop numbers and
 *   `docs/fast-perception.md` records what is still outstanding.
 * - Model *accuracy*. The local arm runs on hand-painted segmentation grids
 *   (`FIXTURE_GRIDS`), which reproduce the model's known blind spots but are
 *   not recorded model output on real photographs.
 */
import { describe, expect, it } from "vitest";
import type { FastPerceptionFrame, SafetyLevel } from "@/core";
import { SESSION_CONTROLLER_CONFIG } from "@/decision";
import {
  CONSERVATIVE_TRUST_POLICY,
  FAST_PERCEPTION_CONFIG,
  FIXTURE_GRIDS,
  readSegmentation,
} from "@/fast-perception";
import { fusePerception } from "@/fusion";
import { FIXTURE_SCENE_IDS, type FixtureSceneId } from "@/providers";
import { SafetyEngine, type PerceptionFusionInput } from "@/safety";
import { sceneAnalysis } from "./helpers";
import { MUST_NOT_BE_SAFE, SAFETY_FLOOR } from "./types";

const NOW = 1_000_000;
const LEVEL_RANK: Record<SafetyLevel, number> = {
  unknown: 0,
  safe: 1,
  caution: 2,
  danger: 3,
  critical: 4,
};

type Arm = "cloud_only" | "local_only" | "hybrid";

interface ArmResult {
  readonly scene: FixtureSceneId;
  readonly level: SafetyLevel;
  readonly meetsFloor: boolean;
  readonly falsePositive: boolean;
  readonly mustNotBeSafeViolation: boolean;
  readonly conflicts: number;
}

interface ArmSummary {
  readonly arm: Arm;
  readonly meetsFloor: number;
  readonly falseNegatives: number;
  readonly falsePositives: number;
  readonly violations: number;
  readonly conflicts: number;
  readonly results: readonly ArmResult[];
}

function localFrame(scene: FixtureSceneId): FastPerceptionFrame {
  const reading = readSegmentation(
    FIXTURE_GRIDS[scene],
    CONSERVATIVE_TRUST_POLICY.maxConfidence,
  );
  return {
    sequence: 1,
    capturedAt: NOW - 20,
    producedAt: NOW,
    availability: "ok",
    answers: reading.answers,
    obstacles: reading.obstacles,
    inferenceMs: 64,
    backend: "recorded",
    modelId: "seaformer-s-ade-384",
  };
}

function runArm(arm: Arm): ArmSummary {
  const engine = new SafetyEngine();
  const results: ArmResult[] = [];

  for (const scene of FIXTURE_SCENE_IDS) {
    const cloud =
      arm === "local_only" ? null : sceneAnalysis(scene, NOW - 200, NOW);
    const local = arm === "cloud_only" ? null : localFrame(scene);

    const fused = fusePerception({
      cloud,
      local,
      policy: CONSERVATIVE_TRUST_POLICY,
      now: NOW,
    });

    const fusion: PerceptionFusionInput | undefined =
      fused.mode === "hybrid" || fused.mode === "local_only"
        ? {
            localOnly: fused.mode === "local_only",
            conflicts: fused.conflicts.map((c) => c.question),
          }
        : undefined;

    const { assessment } = engine.assess({
      sceneAnalysis: fused.analysis,
      location: null,
      heading: null,
      route: null,
      currentRouteStep: null,
      now: NOW,
      ...(fusion ? { fusion } : {}),
    });

    const floor = SAFETY_FLOOR[scene];
    results.push({
      scene,
      level: assessment.level,
      meetsFloor: LEVEL_RANK[assessment.level] >= LEVEL_RANK[floor],
      falsePositive:
        LEVEL_RANK[floor] <= LEVEL_RANK.caution &&
        LEVEL_RANK[assessment.level] >= LEVEL_RANK.danger,
      mustNotBeSafeViolation:
        MUST_NOT_BE_SAFE.includes(scene) &&
        (assessment.level === "safe" || assessment.level === "unknown"),
      conflicts: fused.conflicts.length,
    });
  }

  return {
    arm,
    meetsFloor: results.filter((r) => r.meetsFloor).length,
    falseNegatives: results.filter((r) => !r.meetsFloor).length,
    falsePositives: results.filter((r) => r.falsePositive).length,
    violations: results.filter((r) => r.mustNotBeSafeViolation).length,
    conflicts: results.reduce((sum, r) => sum + r.conflicts, 0),
    results,
  };
}

const ARMS: Arm[] = ["cloud_only", "local_only", "hybrid"];
const summaries = new Map<Arm, ArmSummary>(
  ARMS.map((arm) => [arm, runArm(arm)]),
);

function summary(arm: Arm): ArmSummary {
  const found = summaries.get(arm);
  if (!found) throw new Error(`no summary for ${arm}`);
  return found;
}

describe("cloud-only / local-only / hybrid comparison", () => {
  it("records the comparison table", () => {
    const lines = [
      "",
      "arm          meetsFloor  falseNeg  falsePos  mustNotBeSafe  conflicts",
      ...ARMS.map((arm) => {
        const s = summary(arm);
        return [
          arm.padEnd(13),
          `${String(s.meetsFloor)}/16`.padEnd(12),
          String(s.falseNegatives).padEnd(10),
          String(s.falsePositives).padEnd(10),
          String(s.violations).padEnd(15),
          String(s.conflicts),
        ].join("");
      }),
    ];
    console.info(lines.join("\n"));
    expect(summaries.size).toBe(3);
  });

  it("local-only misses hazards the cloud catches", () => {
    // The justification for keeping the cloud in the loop at all.
    const local = summary("local_only");
    const cloud = summary("cloud_only");
    expect(local.falseNegatives).toBeGreaterThan(cloud.falseNegatives);
  });

  it("local-only cannot see potholes, kerbs or crossings", () => {
    const local = summary("local_only");
    const blind = local.results.filter(
      (r) =>
        ["pothole", "curb", "road_crossing"].includes(r.scene) && !r.meetsFloor,
    );
    expect(blind.length).toBeGreaterThan(0);
  });

  it("hybrid is never worse than cloud-only on floor compliance", () => {
    expect(summary("hybrid").meetsFloor).toBeGreaterThanOrEqual(
      summary("cloud_only").meetsFloor,
    );
  });

  it("hybrid is never worse than local-only on floor compliance", () => {
    expect(summary("hybrid").meetsFloor).toBeGreaterThanOrEqual(
      summary("local_only").meetsFloor,
    );
  });

  it("no arm ever reports a must-not-be-safe scene as safe", () => {
    for (const arm of ARMS) {
      expect(summary(arm).violations).toBe(0);
    }
  });

  it("local-only never reports any scene as safe", () => {
    // Local perception has no way to confirm a clear path, so it must not.
    for (const result of summary("local_only").results) {
      expect(result.level).not.toBe("safe");
    }
  });

  it("hybrid adds no unnecessary stops versus cloud-only", () => {
    // The trust policy exists precisely to keep this at zero: the local
    // `blocked` signal (precision 0.13 in Phase 13) may not force a stop.
    expect(summary("hybrid").falsePositives).toBeLessThanOrEqual(
      summary("cloud_only").falsePositives,
    );
  });

  it("hybrid surfaces conflicts rather than hiding them", () => {
    expect(summary("hybrid").conflicts).toBeGreaterThan(0);
    expect(summary("cloud_only").conflicts).toBe(0);
  });

  it("models a faster first warning for the local path", () => {
    // Structural, from configured intervals — not a measured device number.
    const cloudWorstCaseMs = SESSION_CONTROLLER_CONFIG.analysisIntervalMs;
    const localWorstCaseMs = FAST_PERCEPTION_CONFIG.targetIntervalMs;
    expect(localWorstCaseMs).toBeLessThan(cloudWorstCaseMs);
  });

  it("keeps the local loop within its duty-cycle budget", () => {
    const { targetIntervalMs, backoffFactor, maxIntervalMs } =
      FAST_PERCEPTION_CONFIG;
    expect(targetIntervalMs * backoffFactor).toBeLessThanOrEqual(
      maxIntervalMs * backoffFactor,
    );
    expect(backoffFactor).toBeGreaterThanOrEqual(2);
  });
});
