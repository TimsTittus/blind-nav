/**
 * The local fast-perception loop.
 *
 * Runs at a **higher frequency than the cloud path, but only as fast as the
 * device actually sustains.** The brief's 5–15 FPS is a starting target, not a
 * validated setting, and nothing here establishes that any frame rate is safe.
 * So the loop measures real inference cost and keeps its duty cycle at or
 * below `1 / backoffFactor`: if one inference takes 300 ms with the default
 * factor of 2, the interval becomes 600 ms (≈1.7 FPS) rather than saturating
 * the thread the camera, UI and speech share.
 *
 * Lifecycle guarantees come from {@link FrameScheduler}: never overlapping,
 * paused on a hidden tab, abortable, and self-stopping after repeated failures.
 * Grab **and** inference happen inside the scheduler's capture step, so pacing
 * covers the whole cycle rather than just the pixel read.
 */
import {
  FrameScheduler,
  type SchedulerState,
  type VisibilitySource,
} from "@/camera";
import {
  FastPerceptionFrameSchema,
  NO_FAST_ANSWERS,
  type FastPerceptionAvailability,
  type FastPerceptionFrame,
} from "@/core";
import { readSegmentation } from "./answers";
import type { LocalVisionBackend, RgbaFrame } from "./backend";
import { FAST_PERCEPTION_CONFIG, type FastPerceptionConfig } from "./config";

export interface FastPerceptionState {
  readonly availability: FastPerceptionAvailability;
  /** Most recent accepted frame, or null before the first one. */
  readonly frame: FastPerceptionFrame | null;
  /** Sequence of the most recently applied frame; -1 before any. */
  readonly appliedSequence: number;
  readonly lastError: string | null;
  readonly inFlight: boolean;
  /** Interval the loop is currently pacing itself at (ms). */
  readonly intervalMs: number;
  /** Last measured model time (ms). */
  readonly inferenceMs: number | null;
  /** True once sustaining even `maxIntervalMs` is not possible. */
  readonly deviceTooSlow: boolean;
  readonly schedulerState: SchedulerState;
}

export interface FastPerceptionControllerOptions {
  backend: LocalVisionBackend;
  /** Grab RGBA pixels at the backend's input size. */
  grabFrame: (size: number) => RgbaFrame;
  config?: Partial<FastPerceptionConfig>;
  now?: () => number;
  /** Pass `null` to ignore tab visibility (tests). */
  visibility?: VisibilitySource | null;
}

type Listener = () => void;

export class FastPerceptionController {
  private readonly backend: LocalVisionBackend;
  private readonly grabFrame: (size: number) => RgbaFrame;
  private readonly config: FastPerceptionConfig;
  private readonly now: () => number;
  private readonly scheduler: FrameScheduler<FastPerceptionFrame>;

  private state: FastPerceptionState;
  private readonly listeners = new Set<Listener>();

  private sequence = 0;
  private lastInferenceMs: number | null = null;
  private disposed = false;

  constructor(options: FastPerceptionControllerOptions) {
    this.backend = options.backend;
    this.grabFrame = options.grabFrame;
    this.config = { ...FAST_PERCEPTION_CONFIG, ...options.config };
    this.now = options.now ?? Date.now;

    this.state = {
      availability: "unavailable",
      frame: null,
      appliedSequence: -1,
      lastError: null,
      inFlight: false,
      intervalMs: this.config.targetIntervalMs,
      inferenceMs: null,
      deviceTooSlow: false,
      schedulerState: "stopped",
    };

    this.scheduler = new FrameScheduler<FastPerceptionFrame>({
      intervalMs: () => this.nextInterval(),
      maxConsecutiveErrors: this.config.maxConsecutiveErrors,
      capture: (signal) => this.runOnce(signal),
      onFrame: (frame) => this.applyFrame(frame),
      onError: (error) => this.applyError(error),
      onStateChange: (schedulerState) => {
        this.setState({
          ...this.state,
          schedulerState,
          // A scheduler that stopped itself means the backend keeps failing.
          availability:
            schedulerState === "stopped" && this.state.availability === "error"
              ? "unavailable"
              : this.state.availability,
        });
      },
      ...(options.visibility !== undefined
        ? { visibility: options.visibility }
        : {}),
    });
  }

  getSnapshot = (): FastPerceptionState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(): void {
    if (this.disposed) return;
    this.scheduler.start();
  }

  stop(): void {
    this.scheduler.stop();
  }

  pause(): void {
    this.scheduler.pause();
  }

  resume(): void {
    this.scheduler.resume();
  }

  dispose(): void {
    this.disposed = true;
    this.scheduler.stop();
    this.backend.dispose();
    this.listeners.clear();
  }

  /**
   * Interval for the next cycle: the configured target, raised so the loop
   * never uses more than `1 / backoffFactor` of wall-clock time.
   */
  private nextInterval(): number {
    const required =
      this.lastInferenceMs === null
        ? this.config.targetIntervalMs
        : Math.max(
            this.config.targetIntervalMs,
            this.lastInferenceMs * this.config.backoffFactor,
          );
    const clamped = Math.min(
      this.config.maxIntervalMs,
      Math.max(this.config.minIntervalMs, required),
    );
    if (clamped !== this.state.intervalMs || required > clamped) {
      this.setState({
        ...this.state,
        intervalMs: clamped,
        deviceTooSlow: required > this.config.maxIntervalMs,
      });
    }
    return clamped;
  }

  private async runOnce(signal: AbortSignal): Promise<FastPerceptionFrame> {
    this.setState({ ...this.state, inFlight: true });
    const sequence = this.sequence++;
    try {
      const pixels = this.grabFrame(this.backend.inputSize);
      const result = await this.backend.infer(pixels, signal);
      const reading = readSegmentation(
        result.segmentation,
        this.config.maxConfidence,
      );
      const answered = Object.values(reading.answers).some((a) => a !== null);

      // Parsed, not trusted: the grid came from a model output.
      return FastPerceptionFrameSchema.parse({
        sequence,
        capturedAt: pixels.capturedAt,
        producedAt: this.now(),
        availability: answered ? "ok" : "ambiguous",
        answers: answered ? reading.answers : NO_FAST_ANSWERS,
        obstacles: reading.obstacles,
        inferenceMs: result.inferenceMs,
        backend: this.backend.id,
        modelId: this.backend.modelId,
      } satisfies FastPerceptionFrame);
    } finally {
      this.setState({ ...this.state, inFlight: false });
    }
  }

  /** Drop a frame older than one already applied, as the cloud path does. */
  private applyFrame(frame: FastPerceptionFrame): void {
    if (frame.sequence < this.state.appliedSequence) return;
    this.lastInferenceMs = frame.inferenceMs;
    this.setState({
      ...this.state,
      availability: frame.availability,
      frame,
      appliedSequence: frame.sequence,
      lastError: null,
      inferenceMs: frame.inferenceMs,
    });
  }

  private applyError(error: unknown): void {
    const message =
      error instanceof Error ? error.message : "Local inference failed";
    // Perception becomes unusable, never a silent "clear": the previous frame
    // is dropped so nothing downstream can mistake it for current evidence.
    this.setState({
      ...this.state,
      availability: "error",
      frame: null,
      lastError: message,
    });
  }

  private setState(next: FastPerceptionState): void {
    this.state = next;
    for (const listener of this.listeners) listener();
  }
}
