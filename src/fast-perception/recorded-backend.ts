/**
 * Deterministic backend that replays pre-computed segmentation grids.
 *
 * Used by the tests and the cloud/local/hybrid comparison so the whole local
 * pipeline above {@link LocalVisionBackend} is exercised without a GPU, a model
 * file, or a browser. It is not a simulation of model *accuracy*: the grids it
 * replays are real recorded outputs, supplied by the caller.
 */
import {
  LocalBackendUnavailableError,
  type LocalInferenceResult,
  type LocalVisionBackend,
  type RgbaFrame,
} from "./backend";
import type { SegmentationGrid } from "./segmentation";

export interface RecordedBackendOptions {
  /** Grids handed out in order; the last one repeats once exhausted. */
  readonly grids: readonly SegmentationGrid[];
  /** Reported as model time, so latency assertions are deterministic. */
  readonly inferenceMs?: number;
  readonly inputSize?: number;
  readonly modelId?: string;
  readonly id?: string;
}

export class RecordedVisionBackend implements LocalVisionBackend {
  readonly id: string;
  readonly modelId: string;
  readonly inputSize: number;

  private readonly grids: readonly SegmentationGrid[];
  private readonly inferenceMs: number;
  private index = 0;
  private disposed = false;

  constructor(options: RecordedBackendOptions) {
    if (options.grids.length === 0) {
      throw new Error("RecordedVisionBackend needs at least one grid.");
    }
    this.grids = options.grids;
    this.inferenceMs = options.inferenceMs ?? 20;
    this.inputSize = options.inputSize ?? 384;
    this.modelId = options.modelId ?? "recorded";
    this.id = options.id ?? "recorded";
  }

  infer(
    _frame: RgbaFrame,
    signal?: AbortSignal,
  ): Promise<LocalInferenceResult> {
    if (this.disposed) {
      return Promise.reject(
        new LocalBackendUnavailableError("Backend has been disposed."),
      );
    }
    if (signal?.aborted) {
      return Promise.reject(
        new DOMException("Local inference was aborted.", "AbortError"),
      );
    }
    const grid =
      this.grids[Math.min(this.index, this.grids.length - 1)] ?? this.grids[0];
    this.index++;
    if (!grid) {
      return Promise.reject(new Error("No recorded grid available."));
    }
    return Promise.resolve({
      segmentation: grid,
      inferenceMs: this.inferenceMs,
    });
  }

  dispose(): void {
    this.disposed = true;
  }
}
