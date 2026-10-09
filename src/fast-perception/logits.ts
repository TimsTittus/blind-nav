/**
 * Segmentation logits → the fixed coarse grid.
 *
 * Argmax is taken **at logit resolution** and only then reduced to the grid.
 * Upsampling every class mask to full image resolution first is what made the
 * `transformers.js` segmentation pipeline unusable in Phase 13 (1.5 s and 3 GB
 * for one frame); this path costs single-digit milliseconds.
 */
import { GRID_H, GRID_W } from "./grid";
import type { SegmentationGrid } from "./segmentation";

export interface LogitsTensor {
  /** `[batch, channels, height, width]`. */
  readonly dims: readonly number[];
  readonly data: Float32Array;
}

export function logitsToGrid(
  logits: LogitsTensor,
  classes: readonly string[],
): SegmentationGrid {
  const [, channels = 0, height = 0, width = 0] = logits.dims;
  if (channels <= 0 || height <= 0 || width <= 0) {
    throw new Error(`Unexpected logits shape [${logits.dims.join(", ")}]`);
  }
  const plane = height * width;
  const { data } = logits;

  const argmax = new Uint16Array(plane);
  for (let i = 0; i < plane; i++) {
    let best = 0;
    let bestValue = -Infinity;
    for (let c = 0; c < channels; c++) {
      const value = data[c * plane + i] ?? -Infinity;
      if (value > bestValue) {
        bestValue = value;
        best = c;
      }
    }
    argmax[i] = best;
  }

  const grid: number[][] = [];
  for (let gy = 0; gy < GRID_H; gy++) {
    const row: number[] = [];
    const y0 = Math.floor((gy * height) / GRID_H);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * height) / GRID_H));
    for (let gx = 0; gx < GRID_W; gx++) {
      const x0 = Math.floor((gx * width) / GRID_W);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * width) / GRID_W));
      const counts = new Map<number, number>();
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const k = argmax[y * width + x] ?? 0;
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      }
      let best = 0;
      let bestCount = -1;
      for (const [k, n] of counts) {
        if (n > bestCount) {
          best = k;
          bestCount = n;
        }
      }
      row.push(best);
    }
    grid.push(row);
  }

  return { classes, grid };
}
