/**
 * Category 3: Safety decision evaluation.
 *
 * Verifies that the deterministic SafetyEngine produces safety levels that are
 * never below the expected floor for each scene (SAFETY_FLOOR). Pays special
 * attention to false negatives: cases where a dangerous scene receives "safe"
 * or "unknown" — the most harmful failure mode for an assistive system.
 */
import { describe, expect, it } from "vitest";
import { SafetyEngine } from "@/safety";
import { FIXTURE_SCENE_IDS } from "@/providers/fixture/fixtures";
import {
  MUST_NOT_BE_SAFE,
  SAFETY_FLOOR,
  summarize,
  type EvalResult,
} from "./types";
import { safetyContext } from "./helpers";

const LEVEL_RANK = {
  unknown: -1,
  safe: 0,
  caution: 1,
  danger: 2,
  critical: 3,
} as const;

function rankOf(level: string): number {
  return (LEVEL_RANK as Record<string, number>)[level] ?? -1;
}

describe("Category 3 — Safety decision evaluation", () => {
  const engine = new SafetyEngine();
  const results: EvalResult[] = [];

  it("every fixture scene meets its safety floor", () => {
    for (const id of FIXTURE_SCENE_IDS) {
      const ctx = safetyContext(id);
      const { assessment } = engine.assess(ctx);
      const floor = SAFETY_FLOOR[id];
      const meetsFloor = rankOf(assessment.level) >= rankOf(floor);

      results.push({
        scene: id,
        aspect: "safety_floor",
        outcome: meetsFloor ? "true_positive" : "false_negative",
        detail: `got=${assessment.level} floor=${floor}`,
      });

      expect(
        rankOf(assessment.level),
        `scene=${id}: expected safety level >= ${floor}, got ${assessment.level}`,
      ).toBeGreaterThanOrEqual(rankOf(floor));
    }
  });

  it("critical-hazard scenes are never assessed as safe", () => {
    for (const id of MUST_NOT_BE_SAFE) {
      const ctx = safetyContext(id);
      const { assessment } = engine.assess(ctx);
      const isSafe =
        assessment.level === "safe" || assessment.level === "unknown";

      results.push({
        scene: id,
        aspect: "must_not_be_safe",
        outcome: isSafe ? "false_negative" : "true_positive",
        detail: `level=${assessment.level}`,
      });

      expect(
        isSafe,
        `scene=${id} must never be assessed as safe/unknown (got ${assessment.level})`,
      ).toBe(false);
    }
  });

  it("wall scene (blocked path) is assessed as critical", () => {
    const { assessment } = engine.assess(safetyContext("wall"));
    results.push({
      scene: "wall",
      aspect: "wall_is_critical",
      outcome:
        assessment.level === "critical" ? "true_positive" : "false_negative",
    });
    expect(assessment.level).toBe("critical");
  });

  it("blocked scene is assessed as critical", () => {
    const { assessment } = engine.assess(safetyContext("blocked"));
    results.push({
      scene: "blocked",
      aspect: "blocked_is_critical",
      outcome:
        assessment.level === "critical" ? "true_positive" : "false_negative",
    });
    expect(assessment.level).toBe("critical");
  });

  it("stairs scene is assessed at danger or above", () => {
    for (const id of ["stairs", "stairs_up"] as const) {
      const { assessment } = engine.assess(safetyContext(id));
      const meets = rankOf(assessment.level) >= rankOf("danger");
      results.push({
        scene: id,
        aspect: "stairs_danger_or_above",
        outcome: meets ? "true_positive" : "false_negative",
      });
      expect(
        rankOf(assessment.level),
        `scene=${id} should be danger or higher`,
      ).toBeGreaterThanOrEqual(rankOf("danger"));
    }
  });

  it("clear scene is assessed as safe", () => {
    const { assessment } = engine.assess(safetyContext("clear"));
    results.push({
      scene: "clear",
      aspect: "clear_path_is_safe",
      outcome: assessment.level === "safe" ? "true_positive" : "false_positive",
    });
    expect(assessment.level).toBe("safe");
  });

  it("uncertain/low-light scenes are assessed at caution or above", () => {
    for (const id of ["uncertain", "low_light"] as const) {
      const { assessment } = engine.assess(safetyContext(id));
      const meets = rankOf(assessment.level) >= rankOf("caution");
      results.push({
        scene: id,
        aspect: "uncertainty_yields_caution",
        outcome: meets ? "true_positive" : "false_negative",
      });
      expect(
        rankOf(assessment.level),
        `scene=${id}: uncertain scene must not be assessed as safe`,
      ).toBeGreaterThanOrEqual(rankOf("caution"));
    }
  });

  it("safety assessment carries a non-empty reasons list for non-safe levels", () => {
    const dangerousScenes = FIXTURE_SCENE_IDS.filter(
      (id) => SAFETY_FLOOR[id] !== "safe",
    );
    for (const id of dangerousScenes) {
      const { assessment } = engine.assess(safetyContext(id));
      if (assessment.level !== "safe") {
        expect(
          assessment.reasons.length,
          `scene=${id}: non-safe assessment should include reasons`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("prints safety decision evaluation summary", () => {
    const summary = summarize(results);
    console.log(
      "\n── Safety Decision Evaluation ──\n" +
        `  TP=${summary.truePositives}  FP=${summary.falsePositives}  ` +
        `FN=${summary.falseNegatives}  TN=${summary.trueNegatives}\n` +
        `  Precision=${summary.precision.toFixed(2)}  Recall=${summary.recall.toFixed(2)}  ` +
        `FN-rate=${summary.fnRate.toFixed(2)}  (n=${summary.total})\n`,
    );
    expect(
      summary.falseNegatives,
      "Safety false negatives mean dangerous scenes assessed as safe",
    ).toBe(0);
  });
});
