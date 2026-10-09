/**
 * Turns compact model outputs into answers to the six fast questions. Every
 * answer is tri-state: `true`, `false`, or `null` (this source cannot say).
 *
 * All thresholds below were fixed before the evaluation was first scored and
 * were not tuned on the 40-image set.
 */
import type { FastLabels } from "./dataset";
import {
  GRID_H,
  GRID_W,
  type Detection,
  type DepthOutput,
  type DetectionOutput,
  type SegmentationOutput,
} from "./raw-output";

export type Answer = boolean | null;
export type FastAnswers = { [K in keyof FastLabels]: Answer };

export const NO_ANSWERS: FastAnswers = {
  somethingAhead: null,
  blocked: null,
  sidewalk: null,
  stairs: null,
  largeObstacle: null,
  traversable: null,
};

// ---- geometry (32 × 24 grid; the user walks "into" the bottom-centre) ------

/** Central 12 of 32 columns (≈ 37.5% of width): the walking corridor. */
export const CORRIDOR = { x0: 10, x1: 22 } as const;
/** Ground directly ahead (bottom quarter) and the next stretch (rows 12–17). */
export const NEAR_ROWS = { y0: 18, y1: 24 } as const;
export const AHEAD_ROWS = { y0: 12, y1: 24 } as const;

// ---- segmentation (ADE20K class names) --------------------------------------

const WALKABLE = new Set([
  "floor",
  "road",
  "sidewalk",
  "earth",
  "grass",
  "path",
  "sand",
  "field",
  "dirt track",
  "runway",
  "rug",
  "land",
]);
const FOOTWAY = new Set(["sidewalk", "path"]);
const STAIRS = new Set(["stairs", "stairway", "step", "escalator"]);
/** Never an obstacle even when it falls inside the corridor box. */
const BACKGROUND = new Set(["sky", "ceiling"]);

export type SegRole = "walkable" | "stairs" | "background" | "obstacle";

export function segRole(label: string): SegRole {
  const name = label.trim();
  if (WALKABLE.has(name)) return "walkable";
  if (STAIRS.has(name)) return "stairs";
  if (BACKGROUND.has(name)) return "background";
  return "obstacle";
}

function cells(
  seg: SegmentationOutput,
  rows: { y0: number; y1: number },
  cols: { x0: number; x1: number },
): string[] {
  const out: string[] = [];
  for (let y = rows.y0; y < rows.y1; y++) {
    for (let x = cols.x0; x < cols.x1; x++) {
      out.push(seg.classes[seg.grid[y]?.[x] ?? -1] ?? "unknown");
    }
  }
  return out;
}

const frac = (labels: string[], pred: (l: string) => boolean) =>
  labels.length === 0 ? 0 : labels.filter(pred).length / labels.length;

export interface SegEvidence {
  obstacleAhead: number;
  walkableNear: number;
  footwayAhead: number;
  stairsAhead: number;
  /** Most common obstacle class in the corridor (for the observation label). */
  dominantObstacle: string | null;
  /** Lowest corridor row band containing obstacle cells (for coarse distance). */
  nearestObstacleRow: number | null;
}

export function segEvidence(seg: SegmentationOutput): SegEvidence {
  const ahead = cells(seg, AHEAD_ROWS, CORRIDOR);
  const near = cells(seg, NEAR_ROWS, CORRIDOR);
  const wideAhead = cells(seg, AHEAD_ROWS, { x0: 0, x1: GRID_W });
  const stairsZone = cells(seg, { y0: 8, y1: GRID_H }, { x0: 6, x1: 26 });

  const counts = new Map<string, number>();
  for (const l of ahead)
    if (segRole(l) === "obstacle") counts.set(l, (counts.get(l) ?? 0) + 1);
  const dominantObstacle =
    [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]?.trim() ?? null;

  let nearestObstacleRow: number | null = null;
  for (
    let y = GRID_H - 1;
    y >= AHEAD_ROWS.y0 && nearestObstacleRow === null;
    y--
  ) {
    const row = cells(seg, { y0: y, y1: y + 1 }, CORRIDOR);
    if (frac(row, (l) => segRole(l) === "obstacle") >= 0.5)
      nearestObstacleRow = y;
  }

  return {
    obstacleAhead: frac(ahead, (l) => segRole(l) === "obstacle"),
    walkableNear: frac(
      near,
      (l) => segRole(l) === "walkable" || segRole(l) === "stairs",
    ),
    footwayAhead: frac(wideAhead, (l) => FOOTWAY.has(l.trim())),
    stairsAhead: frac(stairsZone, (l) => STAIRS.has(l.trim())),
    dominantObstacle,
    nearestObstacleRow,
  };
}

export function answersFromSegmentation(seg: SegmentationOutput): FastAnswers {
  const e = segEvidence(seg);
  const stairs = e.stairsAhead >= 0.06;
  const blocked = e.obstacleAhead >= 0.45;
  return {
    somethingAhead: e.obstacleAhead >= 0.1 || stairs,
    blocked,
    sidewalk: e.footwayAhead >= 0.08,
    stairs,
    largeObstacle: e.obstacleAhead >= 0.25,
    traversable: !blocked && e.walkableNear >= 0.3,
  };
}

// ---- v2: walkable free-run (designed AFTER inspecting v1 failures) ----------
//
// v1 assumed obstacles appear in the lower half of the frame. In photos held
// roughly level, a barrier sits mid-frame with pavement below it, so v1 missed
// it. v2 measures how far walkable ground extends up each corridor column and
// whether it ends at an obstacle. Segmentation alone cannot tell a near barrier
// from distant trees where a road recedes; relative depth at the termination
// row is used for that when available. Its scores on the 40-image set are
// optimistic because the rule was designed after seeing v1 fail on that set.

const MIN_FREE_RUN_ROWS = 14; // walkable must reach above row 10 to count as open
const TERMINATED_COLUMN_SHARE = 0.6;
const NEAR_TERMINATION_DISPARITY = 0.45;

export interface FreeRun {
  medianRun: number;
  terminatedShare: number;
  /** Mean normalised disparity just above each terminated column's run (null without depth). */
  terminationDisparity: number | null;
}

export function freeRun(
  seg: SegmentationOutput,
  depth: DepthOutput | null,
): FreeRun {
  const runs: number[] = [];
  let terminated = 0;
  let dispSum = 0;
  let dispN = 0;
  for (let x = CORRIDOR.x0; x < CORRIDOR.x1; x++) {
    let run = 0;
    for (let y = GRID_H - 1; y >= 0; y--) {
      const role = segRole(seg.classes[seg.grid[y]?.[x] ?? -1] ?? "");
      if (role !== "walkable" && role !== "stairs") break;
      run++;
    }
    runs.push(run);
    const stopRow = GRID_H - 1 - run;
    if (stopRow < 0) continue;
    const above = segRole(seg.classes[seg.grid[stopRow]?.[x] ?? -1] ?? "");
    if (above !== "obstacle") continue;
    terminated++;
    if (depth) {
      for (let y = stopRow; y > Math.max(-1, stopRow - 3); y--) {
        dispSum += depth.grid[y]?.[x] ?? 0;
        dispN++;
      }
    }
  }
  const sorted = [...runs].sort((a, b) => a - b);
  return {
    medianRun: sorted[Math.floor(sorted.length / 2)] ?? 0,
    terminatedShare: terminated / runs.length,
    terminationDisparity: depth && dispN > 0 ? dispSum / dispN : null,
  };
}

export function answersFromSegmentationV2(
  seg: SegmentationOutput,
  depth: DepthOutput | null,
): FastAnswers {
  const v1 = answersFromSegmentation(seg);
  const e = segEvidence(seg);
  const run = freeRun(seg, depth);
  const endsAtObstacle =
    run.medianRun < MIN_FREE_RUN_ROWS &&
    run.terminatedShare >= TERMINATED_COLUMN_SHARE;
  const near =
    run.terminationDisparity === null ||
    run.terminationDisparity >= NEAR_TERMINATION_DISPARITY;
  const blocked = endsAtObstacle && near;
  return {
    ...v1,
    somethingAhead: v1.somethingAhead || endsAtObstacle,
    blocked,
    traversable: !blocked && e.walkableNear >= 0.3,
  };
}

// ---- detection (COCO) -------------------------------------------------------

const MIN_SCORE = 0.5;
/** Elevated or irrelevant to the ground path. */
const IGNORED = new Set(["traffic light", "kite", "airplane", "bird", "clock"]);
const CORRIDOR_X = { x0: CORRIDOR.x0 / GRID_W, x1: CORRIDOR.x1 / GRID_W };

export function detectionsInCorridor(det: DetectionOutput): Detection[] {
  return det.detections.filter(
    (d) =>
      d.score >= MIN_SCORE &&
      !IGNORED.has(d.label) &&
      d.box.x1 > CORRIDOR_X.x0 &&
      d.box.x0 < CORRIDOR_X.x1 &&
      d.box.y1 >= 0.5,
  );
}

export function isLargeDetection(d: Detection): boolean {
  const w = d.box.x1 - d.box.x0;
  const h = d.box.y1 - d.box.y0;
  return h >= 0.25 || w * h >= 0.06;
}

export function answersFromDetection(det: DetectionOutput): FastAnswers {
  const inCorridor = detectionsInCorridor(det);
  const corridorWidth = CORRIDOR_X.x1 - CORRIDOR_X.x0;
  const blocking = inCorridor.some((d) => {
    const overlap =
      Math.min(d.box.x1, CORRIDOR_X.x1) - Math.max(d.box.x0, CORRIDOR_X.x0);
    return overlap / corridorWidth >= 0.5 && d.box.y1 >= 0.6;
  });
  return {
    ...NO_ANSWERS,
    somethingAhead: inCorridor.length > 0,
    largeObstacle: inCorridor.some(isLargeDetection),
    // A detector only knows about its 80 classes; "nothing detected" says
    // nothing about walls, barriers, or stairs, so it never answers `false`.
    blocked: blocking ? true : null,
  };
}

// ---- monocular relative depth ------------------------------------------------

/**
 * Ratio of corridor disparity in the middle rows to the ground directly ahead.
 * Flat open ground recedes (ratio well below 1); a surface facing the user
 * keeps disparity high up the image. Relative only — never a distance.
 */
export function depthAheadRatio(depth: DepthOutput): number {
  const mean = (y0: number, y1: number) => {
    let sum = 0;
    let n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = CORRIDOR.x0; x < CORRIDOR.x1; x++) {
        sum += depth.grid[y]?.[x] ?? 0;
        n++;
      }
    }
    return n === 0 ? 0 : sum / n;
  };
  const ground = mean(20, 24);
  return ground <= 0 ? 0 : mean(8, 16) / ground;
}

export function answersFromDepth(depth: DepthOutput): FastAnswers {
  const r = depthAheadRatio(depth);
  return {
    ...NO_ANSWERS,
    somethingAhead: r >= 0.7,
    blocked: r >= 0.85 ? true : null,
  };
}

// ---- fusion ---------------------------------------------------------------

const HAZARD_QUESTIONS = [
  "somethingAhead",
  "blocked",
  "stairs",
  "largeObstacle",
] as const;

/**
 * Asymmetric fusion: any source saying "hazard" wins; "no hazard" requires at
 * least one source that can answer and none that disagree. Traversable is
 * vetoed by any blocked signal.
 */
export function fuse(sources: FastAnswers[]): FastAnswers {
  const out: FastAnswers = { ...NO_ANSWERS };
  for (const q of HAZARD_QUESTIONS) {
    const answers = sources
      .map((s) => s[q])
      .filter((a): a is boolean => a !== null);
    out[q] = answers.length === 0 ? null : answers.some(Boolean);
  }
  const sidewalk = sources
    .map((s) => s.sidewalk)
    .filter((a): a is boolean => a !== null);
  out.sidewalk = sidewalk.length === 0 ? null : sidewalk.some(Boolean);
  const trav = sources
    .map((s) => s.traversable)
    .filter((a): a is boolean => a !== null);
  out.traversable =
    out.blocked === true
      ? false
      : trav.length === 0
        ? null
        : trav.every(Boolean);
  return out;
}
