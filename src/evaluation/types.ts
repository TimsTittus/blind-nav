/**
 * Types for the Phase 11 evaluation framework.
 *
 * These represent expected outcomes for each fixture scene across seven test
 * categories: scene understanding, hazard detection, safety decision, navigation
 * instruction, speech behavior, latency, and failure handling.
 *
 * No AI calls are made here. The framework evaluates the deterministic layers
 * (safety engine, speech dispatch, image validation) against known fixture data.
 */
import type { FixtureSceneId } from "@/providers/fixture/fixtures";
import type { SafetyLevel } from "@/core";

/** One scored outcome for a single test case. */
export type EvalOutcome =
  | "true_positive" // expected event occurred as expected
  | "false_positive" // event fired when it should not have
  | "false_negative" // expected event did NOT occur — highest concern for safety
  | "true_negative" // correctly did not fire
  | "unknown"; // outcome cannot be determined

export interface EvalCase {
  scene: FixtureSceneId;
  /** What aspect is being evaluated. */
  aspect: string;
  /** Human-readable expected outcome. */
  expectation: string;
}

export interface EvalResult {
  scene: FixtureSceneId;
  aspect: string;
  outcome: EvalOutcome;
  detail?: string;
}

/** Aggregate counts for a set of eval results. */
export interface EvalSummary {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  trueNegatives: number;
  unknown: number;
  total: number;
  /** False negative rate — critical metric for safety systems. */
  fnRate: number;
  precision: number;
  recall: number;
}

export function summarize(results: EvalResult[]): EvalSummary {
  const counts = { tp: 0, fp: 0, fn: 0, tn: 0, unk: 0 };
  for (const r of results) {
    switch (r.outcome) {
      case "true_positive":
        counts.tp++;
        break;
      case "false_positive":
        counts.fp++;
        break;
      case "false_negative":
        counts.fn++;
        break;
      case "true_negative":
        counts.tn++;
        break;
      default:
        counts.unk++;
        break;
    }
  }
  const total = counts.tp + counts.fp + counts.fn + counts.tn + counts.unk;
  const precision =
    counts.tp + counts.fp > 0 ? counts.tp / (counts.tp + counts.fp) : 1;
  const recall =
    counts.tp + counts.fn > 0 ? counts.tp / (counts.tp + counts.fn) : 1;
  const fnRate =
    counts.tp + counts.fn > 0 ? counts.fn / (counts.tp + counts.fn) : 0;
  return {
    truePositives: counts.tp,
    falsePositives: counts.fp,
    falseNegatives: counts.fn,
    trueNegatives: counts.tn,
    unknown: counts.unk,
    total,
    fnRate,
    precision,
    recall,
  };
}

/** Scenes where the safety level must not be lower than `minLevel`. */
export const SAFETY_FLOOR: Record<FixtureSceneId, SafetyLevel> = {
  clear: "safe",
  clear_road: "safe",
  puddle: "caution",
  pothole: "danger",
  obstacle: "caution",
  parked_vehicle: "caution",
  moving_person: "caution",
  stairs: "danger",
  stairs_up: "danger",
  curb: "caution",
  wall: "critical",
  narrow_path: "caution",
  road_crossing: "danger",
  blocked: "critical",
  uncertain: "caution",
  low_light: "caution",
};

/** Scenes that must NEVER produce a "safe" or "unknown" safety level. */
export const MUST_NOT_BE_SAFE: FixtureSceneId[] = [
  "stairs",
  "stairs_up",
  "blocked",
  "wall",
  "road_crossing",
  "pothole",
];
