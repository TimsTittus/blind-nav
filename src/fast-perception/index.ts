export {
  DEFAULT_CLASSES_URL,
  DEFAULT_INPUT_SIZE,
  DEFAULT_MODEL_URL,
  FAST_PERCEPTION_CONFIG,
} from "./config";
export type { FastPerceptionConfig } from "./config";
export { LocalBackendUnavailableError } from "./backend";
export type {
  LocalInferenceResult,
  LocalVisionBackend,
  RgbaFrame,
} from "./backend";
export {
  answersFromSegmentation,
  obstaclesFromSegmentation,
  readSegmentation,
} from "./answers";
export type { SegmentationReading } from "./answers";
export { fastTypeOfClass, segEvidence, segRole } from "./segmentation";
export type { SegEvidence, SegmentationGrid, SegRole } from "./segmentation";
export {
  AHEAD_ROWS,
  bandOf,
  CORRIDOR,
  GRID_H,
  GRID_W,
  lateralOf,
  NEAR_ROWS,
  STAIRS_ZONE,
} from "./grid";
export { buildGrid, FIXTURE_GRIDS, openGround } from "./grid-builders";
export type { GridBand, GridSpec } from "./grid-builders";
export { logitsToGrid } from "./logits";
export type { LogitsTensor } from "./logits";
export {
  CONSERVATIVE_TRUST_POLICY,
  mayEscalate,
  STAIRS_ONLY_TRUST_POLICY,
} from "./trust-policy";
export type { FastTrustPolicy } from "./trust-policy";
export { toSceneObservation } from "./to-observation";
export { FastPerceptionController } from "./controller";
export type {
  FastPerceptionControllerOptions,
  FastPerceptionState,
} from "./controller";
export { FastFrameError, FastFrameSource } from "./frame-source";
export type { FastFrameErrorKind, FastFrameSourceDeps } from "./frame-source";
export { RecordedVisionBackend } from "./recorded-backend";
export type { RecordedBackendOptions } from "./recorded-backend";
export { createOnnxBackend } from "./create-backend";
export type { OnnxBackendOptions } from "./create-backend";
// NOTE: the `OnnxVisionBackend` class is intentionally NOT re-exported. It pulls in
// `onnxruntime-web` and its WASM artifacts, so it must be imported directly
// (and lazily) by the code that actually enables local inference.
