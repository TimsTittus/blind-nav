/**
 * Builders for synthetic segmentation grids, plus one grid per Phase-11 fixture
 * scene.
 *
 * **These are hand-painted grids, not recorded model output.** They let the
 * local pipeline, the fusion layer and the cloud/local/hybrid comparison run
 * deterministically with no model, no GPU and no network. They therefore
 * measure *pipeline behaviour* — what the rules, the trust policy and the merge
 * do with a given reading — and say nothing about how accurately SeaFormer
 * would label a real photo of that scene. Real accuracy numbers live in
 * `docs/local-cv-evaluation.md`.
 *
 * Where a scene has no corresponding ADE20K class (potholes, curbs), the grid
 * is painted as the model would actually see it — plain walkable ground — so
 * the comparison reproduces the real blind spots rather than hiding them.
 */
import type { FixtureSceneId } from "@/providers/fixture/fixtures";
import { GRID_H, GRID_W } from "./grid";
import type { SegmentationGrid } from "./segmentation";

export interface GridBand {
  /** Inclusive top row. */
  y0: number;
  /** Exclusive bottom row. */
  y1: number;
  x0?: number;
  x1?: number;
  label: string;
}

export interface GridSpec {
  /** Painted first, under everything else. */
  base: string;
  /** Painted in order, so later entries win. */
  bands?: GridBand[];
}

export function buildGrid(spec: GridSpec): SegmentationGrid {
  const classes: string[] = [spec.base];
  const indexOf = (label: string): number => {
    const existing = classes.indexOf(label);
    if (existing !== -1) return existing;
    classes.push(label);
    return classes.length - 1;
  };

  const grid: number[][] = Array.from({ length: GRID_H }, () =>
    Array.from({ length: GRID_W }, () => 0),
  );

  for (const band of spec.bands ?? []) {
    const index = indexOf(band.label);
    const x0 = Math.max(0, band.x0 ?? 0);
    const x1 = Math.min(GRID_W, band.x1 ?? GRID_W);
    for (let y = Math.max(0, band.y0); y < Math.min(GRID_H, band.y1); y++) {
      for (let x = x0; x < x1; x++) {
        const row = grid[y];
        if (row) row[x] = index;
      }
    }
  }

  return { classes, grid };
}

/** Open ground with a clear corridor: the baseline "nothing to report" grid. */
export function openGround(surface = "sidewalk"): SegmentationGrid {
  return buildGrid({
    base: "sky",
    bands: [
      { y0: 8, y1: 12, label: "tree" },
      { y0: 10, y1: GRID_H, label: surface },
    ],
  });
}

/**
 * One grid per fixture scene. Four scenes are deliberately painted as "looks
 * like open ground" because segmentation genuinely cannot see them:
 * `pothole`, `curb`, `clear`-like road surface defects and `low_light` detail.
 */
export const FIXTURE_GRIDS: Record<FixtureSceneId, SegmentationGrid> = {
  clear: openGround("sidewalk"),
  clear_road: openGround("road"),

  // Standing water reads as the ADE20K "water" class: an obstacle, not ground.
  puddle: buildGrid({
    base: "sky",
    bands: [
      { y0: 10, y1: GRID_H, label: "sidewalk" },
      { y0: 19, y1: 23, x0: 12, x1: 20, label: "water" },
    ],
  }),

  // No ADE20K class for a hole in the ground: the model sees clear pavement.
  pothole: openGround("road"),

  obstacle: buildGrid({
    base: "sky",
    bands: [
      { y0: 10, y1: GRID_H, label: "sidewalk" },
      { y0: 14, y1: 22, x0: 12, x1: 20, label: "box" },
    ],
  }),

  parked_vehicle: buildGrid({
    base: "sky",
    bands: [
      { y0: 10, y1: GRID_H, label: "road" },
      { y0: 13, y1: 21, x0: 14, x1: 24, label: "car" },
    ],
  }),

  moving_person: buildGrid({
    base: "sky",
    bands: [
      { y0: 10, y1: GRID_H, label: "sidewalk" },
      { y0: 11, y1: 22, x0: 13, x1: 19, label: "person" },
    ],
  }),

  stairs: buildGrid({
    base: "sky",
    bands: [
      { y0: 10, y1: 18, label: "sidewalk" },
      { y0: 16, y1: GRID_H, x0: 8, x1: 24, label: "stairs" },
    ],
  }),

  stairs_up: buildGrid({
    base: "sky",
    bands: [
      { y0: 8, y1: 16, label: "wall" },
      { y0: 12, y1: GRID_H, x0: 7, x1: 25, label: "stairs" },
    ],
  }),

  // A kerb is a few centimetres of height change between two walkable
  // surfaces. Segmentation sees road meeting sidewalk and nothing more.
  curb: buildGrid({
    base: "sky",
    bands: [
      { y0: 10, y1: 18, label: "road" },
      { y0: 18, y1: GRID_H, label: "sidewalk" },
    ],
  }),

  wall: buildGrid({
    base: "sky",
    bands: [
      { y0: 0, y1: 20, label: "wall" },
      { y0: 20, y1: GRID_H, label: "sidewalk" },
    ],
  }),

  narrow_path: buildGrid({
    base: "sky",
    bands: [
      { y0: 10, y1: GRID_H, label: "sidewalk" },
      { y0: 10, y1: GRID_H, x0: 0, x1: 12, label: "fence" },
      { y0: 10, y1: GRID_H, x0: 20, x1: GRID_W, label: "fence" },
    ],
  }),

  // Traffic semantics (signals, markings, right of way) are cloud-only.
  road_crossing: buildGrid({
    base: "sky",
    bands: [
      { y0: 10, y1: GRID_H, label: "road" },
      { y0: 11, y1: 14, x0: 24, x1: GRID_W, label: "car" },
    ],
  }),

  blocked: buildGrid({
    base: "sky",
    bands: [
      { y0: 10, y1: 21, label: "fence" },
      { y0: 21, y1: GRID_H, label: "sidewalk" },
    ],
  }),

  uncertain: buildGrid({
    base: "sky",
    bands: [
      { y0: 12, y1: GRID_H, label: "earth" },
      { y0: 14, y1: 20, x0: 10, x1: 16, label: "tree" },
    ],
  }),

  // Low light does not change which classes exist, only how reliably the model
  // finds them; a plausible failure is under-segmenting into one dark mass.
  low_light: buildGrid({
    base: "sky",
    bands: [{ y0: 6, y1: GRID_H, label: "building" }],
  }),
};
