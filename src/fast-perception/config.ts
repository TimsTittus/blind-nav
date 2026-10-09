/**
 * Tunable constants for the local fast-perception loop.
 *
 * The frequency targets come from the Phase 14 brief and are **starting
 * targets, not validated settings**. No frame rate here has been shown to be
 * safe on any device; the controller measures real inference cost and backs off
 * (see `controller.ts`).
 */

export interface FastPerceptionConfig {
  /** Target gap between local inferences (ms). 150 ms ≈ 6.7 FPS. */
  readonly targetIntervalMs: number;
  /** Never run faster than this, whatever the device can do (ms). */
  readonly minIntervalMs: number;
  /** Back off no further than this before declaring the device too slow (ms). */
  readonly maxIntervalMs: number;
  /**
   * Keep the loop's duty cycle at or below `1 / backoffFactor` so inference
   * cannot monopolise the main thread: interval ≥ lastInference × factor.
   */
  readonly backoffFactor: number;
  /** A local frame older than this is no longer usable evidence (ms). */
  readonly staleMs: number;
  /** Consecutive inference failures before the loop gives up. */
  readonly maxConsecutiveErrors: number;
  /** Highest confidence local perception may ever claim. */
  readonly maxConfidence: number;
}

export const FAST_PERCEPTION_CONFIG: FastPerceptionConfig = {
  targetIntervalMs: 150,
  minIntervalMs: 100,
  maxIntervalMs: 1_000,
  backoffFactor: 2,
  staleMs: 1_000,
  maxConsecutiveErrors: 5,
  maxConfidence: 0.6,
};

/**
 * Where the ONNX weights are fetched from. Deliberately **absent by default**:
 * the SeaFormer/ADE20K licence review from Phase 13 (ADR 0026) is unresolved,
 * so no weights are committed or deployed. Until a developer places a file
 * here, the capability layer reports local perception as unavailable.
 */
export const DEFAULT_MODEL_URL = "/models/seaformer_s_ade_384.onnx";
export const DEFAULT_CLASSES_URL = "/models/seaformer_classes.json";
/** Square input the Phase 13 export was traced at. */
export const DEFAULT_INPUT_SIZE = 384;
