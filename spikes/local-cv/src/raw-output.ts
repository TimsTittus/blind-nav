/**
 * Compact, model-agnostic summaries of raw model output, saved per image so the
 * evaluation can combine candidates without re-running inference.
 */

export const GRID_W = 32;
export const GRID_H = 24;

export interface Detection {
  label: string;
  score: number;
  /** Normalised [0,1] box. */
  box: { x0: number; y0: number; x1: number; y1: number };
}

export interface DetectionOutput {
  kind: "detection";
  detections: Detection[];
}

export interface SegmentationOutput {
  kind: "segmentation";
  /** Class names indexed by the values in `grid`. */
  classes: string[];
  /** GRID_H rows × GRID_W columns of class indices (majority label per cell). */
  grid: number[][];
}

export interface DepthOutput {
  kind: "depth";
  /** GRID_H × GRID_W relative inverse depth, min-max normalised per image (1 = nearest). Not metric. */
  grid: number[][];
}

export type RawOutput = DetectionOutput | SegmentationOutput | DepthOutput;

export interface ImageResult {
  id: string;
  latencyMs: number;
  output: RawOutput;
}

export interface BenchmarkRecord {
  key: string;
  model: string;
  dtype: string;
  threads: number;
  modelFileMB: number;
  loadMs: number;
  coldInferenceMs: number;
  warmMedianMs: number;
  warmP95Ms: number;
  /** Direct mode only: median stage timings. */
  stageMedianMs?: { pre: number; model: number; post: number };
  /** Direct mode only: tensor shape actually fed to the model. */
  inputShape?: number[];
  rssBaselineMB: number;
  rssAfterLoadMB: number;
  rssPeakMB: number;
  images: ImageResult[];
}
