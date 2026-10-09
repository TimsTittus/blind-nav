/**
 * Reduction of a semantic-segmentation grid into the few geometric facts the
 * answer rules need. ADE20K class *names* are confined to this file; nothing
 * above it knows what classes the model was trained on.
 */
import type { FastObstacleType } from "@/core";
import {
  AHEAD_ROWS,
  CORRIDOR,
  GRID_H,
  GRID_W,
  NEAR_ROWS,
  STAIRS_ZONE,
} from "./grid";

/** A backend's output reduced to the fixed coarse grid. */
export interface SegmentationGrid {
  /** Class names indexed by the values in `grid`. */
  readonly classes: readonly string[];
  /** `GRID_H` rows × `GRID_W` columns of class indices. */
  readonly grid: readonly (readonly number[])[];
}

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

/**
 * Anything not explicitly walkable, stairs or background counts as an
 * obstacle. Erring toward "obstacle" is the safe direction for an unknown
 * class, but it is also why open horizons produce false alarms (ADR 0026 §5.1).
 */
export function segRole(label: string): SegRole {
  const name = label.trim();
  if (WALKABLE.has(name)) return "walkable";
  if (STAIRS.has(name)) return "stairs";
  if (BACKGROUND.has(name)) return "background";
  return "obstacle";
}

function labelAt(seg: SegmentationGrid, y: number, x: number): string {
  return seg.classes[seg.grid[y]?.[x] ?? -1] ?? "unknown";
}

function cells(
  seg: SegmentationGrid,
  rows: { y0: number; y1: number },
  cols: { x0: number; x1: number },
): string[] {
  const out: string[] = [];
  for (let y = rows.y0; y < rows.y1; y++) {
    for (let x = cols.x0; x < cols.x1; x++) out.push(labelAt(seg, y, x));
  }
  return out;
}

function frac(labels: string[], pred: (label: string) => boolean): number {
  return labels.length === 0 ? 0 : labels.filter(pred).length / labels.length;
}

export interface SegEvidence {
  /** Share of the corridor ahead occupied by obstacle classes. */
  readonly obstacleAhead: number;
  /** Share of the ground directly ahead that is walkable. */
  readonly walkableNear: number;
  /** Share of the full width ahead that is sidewalk/path. */
  readonly footwayAhead: number;
  /** Share of the stairs zone that is a stair class. */
  readonly stairsAhead: number;
  /** Most common obstacle class in the corridor. */
  readonly dominantObstacle: string | null;
  /** Lowest corridor row that is mostly obstacle, or null. */
  readonly nearestObstacleRow: number | null;
}

export function segEvidence(seg: SegmentationGrid): SegEvidence {
  const ahead = cells(seg, AHEAD_ROWS, CORRIDOR);
  const near = cells(seg, NEAR_ROWS, CORRIDOR);
  const wideAhead = cells(seg, AHEAD_ROWS, { x0: 0, x1: GRID_W });
  const stairsZone = cells(
    seg,
    { y0: STAIRS_ZONE.y0, y1: STAIRS_ZONE.y1 },
    { x0: STAIRS_ZONE.x0, x1: STAIRS_ZONE.x1 },
  );

  const counts = new Map<string, number>();
  for (const label of ahead) {
    if (segRole(label) === "obstacle") {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  const dominantObstacle =
    [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]?.trim() ?? null;

  let nearestObstacleRow: number | null = null;
  for (let y = GRID_H - 1; y >= AHEAD_ROWS.y0; y--) {
    const row = cells(seg, { y0: y, y1: y + 1 }, CORRIDOR);
    if (frac(row, (l) => segRole(l) === "obstacle") >= 0.5) {
      nearestObstacleRow = y;
      break;
    }
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

/** Maps an ADE20K class name onto the normalized fast obstacle vocabulary. */
const ADE_TO_FAST = new Map<string, FastObstacleType>([
  ["wall", "wall"],
  ["building", "wall"],
  ["house", "wall"],
  ["fence", "barrier"],
  ["railing", "barrier"],
  ["bench", "barrier"],
  ["pole", "pole"],
  ["streetlight", "pole"],
  ["column", "pole"],
  ["signboard", "pole"],
  ["traffic light", "pole"],
  ["person", "person"],
  ["car", "vehicle"],
  ["truck", "vehicle"],
  ["van", "vehicle"],
  ["bus", "vehicle"],
  ["minibike", "vehicle"],
  ["bicycle", "cyclist"],
  ["door", "door"],
  ["water", "water"],
  ["stairs", "stairs"],
  ["stairway", "stairs"],
  ["step", "stairs"],
  ["escalator", "stairs"],
]);

export function fastTypeOfClass(label: string | null): FastObstacleType {
  if (!label) return "unknown";
  return ADE_TO_FAST.get(label.trim()) ?? "other";
}
