/**
 * The seam that keeps the inference runtime replaceable.
 *
 * Everything above this interface is pure, synchronous reasoning over a coarse
 * class grid; everything below it is runtime-specific (ONNX Runtime Web today,
 * something else tomorrow). Only the backend may know about tensors, WebGPU,
 * WASM or model file layout.
 */
import type { SegmentationGrid } from "./segmentation";

/**
 * Raw pixels ready for inference, already scaled by the caller to the
 * backend's `inputSize` square. Deliberately not a `Blob`: the local loop must
 * not pay for image encoding on every frame.
 */
export interface RgbaFrame {
  /** RGBA, 4 bytes per pixel, length `width * height * 4`. */
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  /** `Date.now()` when the pixels were read from the video. */
  readonly capturedAt: number;
}

export interface LocalInferenceResult {
  readonly segmentation: SegmentationGrid;
  /** Model time only, excluding capture, scaling and grid reduction. */
  readonly inferenceMs: number;
}

export interface LocalVisionBackend {
  /** Identifies the runtime and execution provider, e.g. "onnx-webgpu". */
  readonly id: string;
  /** Identifies the weights, e.g. "seaformer-s-ade-384". */
  readonly modelId: string;
  /** Square edge length the caller must scale frames to. */
  readonly inputSize: number;

  infer(frame: RgbaFrame, signal?: AbortSignal): Promise<LocalInferenceResult>;

  dispose(): void;
}

/** Thrown when a backend cannot be created (no weights, no runtime support). */
export class LocalBackendUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LocalBackendUnavailableError";
  }
}
