/**
 * Fixed coarse grid every backend reduces its output to, and the corridor
 * geometry the answer rules use. Keeping the grid fixed is what lets the rules
 * stay model-agnostic: a segmentation model with a different output resolution
 * still produces a 32 × 24 grid of class indices.
 *
 * The user walks "into" the bottom-centre of the frame.
 */

export const GRID_W = 32;
export const GRID_H = 24;

/** Central 12 of 32 columns (≈ 37.5% of width): the walking corridor. */
export const CORRIDOR = { x0: 10, x1: 22 } as const;
/** Ground directly ahead (bottom quarter). */
export const NEAR_ROWS = { y0: 18, y1: 24 } as const;
/** The next stretch of path (rows 12–23). */
export const AHEAD_ROWS = { y0: 12, y1: 24 } as const;
/** Wider, taller zone where stairs are looked for. */
export const STAIRS_ZONE = { y0: 8, y1: GRID_H, x0: 6, x1: 26 } as const;

/** Lateral third a normalised x (0..1) falls in. */
export function lateralOf(x: number): "left" | "center" | "right" {
  if (x < 0.4) return "left";
  if (x > 0.6) return "right";
  return "center";
}

/**
 * Coarse band from a normalised row (0 = top, 1 = bottom). Lower in frame
 * means closer for ground-standing objects. This is an image-space ordering,
 * never a distance.
 */
export function bandOf(y: number): "near" | "mid" | "far" {
  if (y >= 0.75) return "near";
  if (y >= 0.5) return "mid";
  return "far";
}
