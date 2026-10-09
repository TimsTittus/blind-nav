export { CAMERA_STATES, transitionCamera } from "./state";
export type { CameraState, CameraEvent } from "./state";
export { CameraController, INITIAL_CAMERA_SNAPSHOT } from "./controller";
export type { CameraSnapshot, CameraFacing } from "./controller";
export { classifyCameraError } from "./errors";
export type { CameraError, CameraErrorKind } from "./errors";
export { FRAME_CAPTURE_DEFAULTS, FRAME_CAPTURE_LIMITS } from "./config";
export {
  FrameCapture,
  FrameCaptureError,
  fitWithin,
  detectWebPSupport,
  resetWebPDetection,
} from "./frame-capture";
export type {
  CapturedFrame,
  FrameCaptureCallOptions,
  FrameCaptureOptions,
} from "./frame-capture";
export { FrameScheduler } from "./frame-scheduler";
export type { FrameSchedulerOptions, SchedulerState } from "./frame-scheduler";
export { documentVisibility } from "./visibility";
export type { VisibilitySource } from "./visibility";
export { createDevLoggingConsumer, frameMetadata } from "./frame-consumer";
export type { FrameConsumer, FrameMetadata } from "./frame-consumer";
export { useCamera } from "./use-camera";
export type { UseCamera } from "./use-camera";
export { useFrameLoop } from "./use-frame-loop";
