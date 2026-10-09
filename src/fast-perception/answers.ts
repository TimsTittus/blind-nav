/**
 * Segmentation evidence → the six tri-state fast answers, plus the normalized
 * obstacle list.
 *
 * **Thresholds are the Phase 13 "v1" rule**, fixed before that evaluation was
 * scored. The "v2" rule is deliberately *not* shipped: it was designed after
 * inspecting v1's failures on the same 40 images, and although it caught every
 * blocked scene it also produced 21 unnecessary stops in 40 (ADR 0026 §5).
 * Measured v1 behaviour on that set, for reference:
 *
 * | question      | recall | precision |
 * | ------------- | ------ | --------- |
 * | stairs        | 0.83   | 1.00      |
 * | somethingAhead| 0.91   | 0.63      |
 * | largeObstacle | 0.70   | 0.33      |
 * | blocked       | 0.33   | 0.13      |
 *
 * `blocked` is why `trust-policy.ts` exists.
 */
import type { FastAnswers, FastObstacle } from "@/core";
import { bandOf, GRID_H, lateralOf } from "./grid";
import {
  fastTypeOfClass,
  segEvidence,
  type SegEvidence,
  type SegmentationGrid,
} from "./segmentation";

const OBSTACLE_AHEAD_SOMETHING = 0.1;
const OBSTACLE_AHEAD_LARGE = 0.25;
const OBSTACLE_AHEAD_BLOCKED = 0.45;
const STAIRS_SHARE = 0.06;
const FOOTWAY_SHARE = 0.08;
const WALKABLE_NEAR_TRAVERSABLE = 0.3;

export function answersFromSegmentation(evidence: SegEvidence): FastAnswers {
  const stairs = evidence.stairsAhead >= STAIRS_SHARE;
  const blocked = evidence.obstacleAhead >= OBSTACLE_AHEAD_BLOCKED;
  return {
    somethingAhead:
      evidence.obstacleAhead >= OBSTACLE_AHEAD_SOMETHING || stairs,
    blocked,
    sidewalk: evidence.footwayAhead >= FOOTWAY_SHARE,
    stairs,
    largeObstacle: evidence.obstacleAhead >= OBSTACLE_AHEAD_LARGE,
    traversable: !blocked && evidence.walkableNear >= WALKABLE_NEAR_TRAVERSABLE,
  };
}

/**
 * Normalized obstacles. At most two are produced from segmentation alone — the
 * dominant obstacle in the corridor and, separately, stairs — because a class
 * grid cannot separate instances. `movement` is always `unknown`: this is a
 * single frame.
 */
export function obstaclesFromSegmentation(
  evidence: SegEvidence,
  answers: FastAnswers,
  maxConfidence: number,
): FastObstacle[] {
  const obstacles: FastObstacle[] = [];

  if (
    answers.somethingAhead === true &&
    evidence.dominantObstacle !== null &&
    evidence.nearestObstacleRow !== null
  ) {
    obstacles.push({
      type: fastTypeOfClass(evidence.dominantObstacle),
      region: {
        lateral: lateralOf(0.5),
        band: bandOf((evidence.nearestObstacleRow + 1) / GRID_H),
      },
      confidence: round(Math.min(0.2 + evidence.obstacleAhead, maxConfidence)),
      movement: "unknown",
    });
  }

  if (answers.stairs === true) {
    obstacles.push({
      type: "stairs",
      region: { lateral: "center", band: "near" },
      confidence: round(Math.min(0.3 + evidence.stairsAhead, maxConfidence)),
      // A stair flight does not move; direction (up/down) is not knowable here.
      movement: "stationary",
    });
  }

  return obstacles;
}

export interface SegmentationReading {
  readonly answers: FastAnswers;
  readonly obstacles: FastObstacle[];
  readonly evidence: SegEvidence;
}

export function readSegmentation(
  seg: SegmentationGrid,
  maxConfidence: number,
): SegmentationReading {
  const evidence = segEvidence(seg);
  const answers = answersFromSegmentation(evidence);
  return {
    answers,
    obstacles: obstaclesFromSegmentation(evidence, answers, maxConfidence),
    evidence,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
