import {
  type AppError,
  isAppError,
  toSerializedAppError,
  UnavailableError,
} from "@/core";
import type { AnalyzeFrameContext } from "@/providers";
import type { AnalysisClient } from "./analysis-client";
import { isAnalyzeSuccess } from "./analyze-contract";
import {
  applyAnalysis,
  applyFailure,
  INITIAL_PERCEPTION_STATE,
  type PerceptionState,
} from "./perception-state";

/** A frame ready to analyze (already encoded as a data URL by the caller). */
export interface SubmittableFrame {
  dataUrl: string;
  capturedAt: number;
  width?: number;
  height?: number;
}

export interface PerceptionControllerOptions {
  client: AnalysisClient;
  /** Supplies per-request context (mode, dev scenario). */
  getContext?: () => AnalyzeFrameContext | undefined;
  /** Injectable clock for latency/timestamps. */
  now?: () => number;
}

type Listener = () => void;

/**
 * Orchestrates AI analysis with **one request in flight at a time**. New frames
 * that arrive while a request is running are coalesced into a single "pending
 * latest" slot (older pending frames are dropped), so the pipeline never issues
 * concurrent provider calls and always catches up to the newest frame.
 *
 * Each request carries a monotonic sequence; results are applied through
 * {@link applyAnalysis}/{@link applyFailure}, which discard any result older
 * than the one already applied. `dispose()` aborts in-flight work and blocks
 * further submissions (for unmount / session cancellation).
 */
export class PerceptionController {
  private readonly client: AnalysisClient;
  private readonly getContext: () => AnalyzeFrameContext | undefined;
  private readonly now: () => number;

  private state: PerceptionState = INITIAL_PERCEPTION_STATE;
  private readonly listeners = new Set<Listener>();

  private sequence = 0;
  private busy = false;
  private pending: SubmittableFrame | null = null;
  private controller: AbortController | null = null;
  private disposed = false;

  constructor(options: PerceptionControllerOptions) {
    this.client = options.client;
    this.getContext = options.getContext ?? (() => undefined);
    this.now = options.now ?? Date.now;
  }

  getSnapshot = (): PerceptionState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Submit the newest frame for analysis. Returns immediately. */
  submit(frame: SubmittableFrame): void {
    if (this.disposed) return;
    if (this.busy) {
      this.pending = frame; // keep only the newest while one is in flight
      return;
    }
    void this.run(frame);
  }

  /** Abort any in-flight request and stop accepting new frames. */
  dispose(): void {
    this.disposed = true;
    this.pending = null;
    this.controller?.abort();
    this.controller = null;
    this.busy = false;
  }

  private async run(frame: SubmittableFrame): Promise<void> {
    this.busy = true;
    const sequence = ++this.sequence;
    const controller = new AbortController();
    this.controller = controller;
    const startedAt = this.now();
    const context = this.getContext();
    this.setState({ ...this.state, inFlight: true });

    try {
      const response = await this.client.analyze({
        dataUrl: frame.dataUrl,
        capturedAt: frame.capturedAt,
        sequence,
        ...(frame.width !== undefined ? { width: frame.width } : {}),
        ...(frame.height !== undefined ? { height: frame.height } : {}),
        ...(context ? { context } : {}),
        signal: controller.signal,
      });
      if (this.disposed) return;
      if (isAnalyzeSuccess(response)) {
        const latency = response.latencyMs ?? this.now() - startedAt;
        this.setState(
          applyAnalysis(this.state, sequence, response.analysis, latency),
        );
      } else {
        this.setState(
          applyFailure(this.state, sequence, response.error, this.now()),
        );
      }
    } catch (error) {
      if (this.disposed || isAbort(error)) return;
      const appError: AppError = isAppError(error)
        ? error
        : new UnavailableError("Perception failed unexpectedly.", {
            cause: error,
          });
      this.setState(
        applyFailure(
          this.state,
          sequence,
          toSerializedAppError(appError),
          this.now(),
        ),
      );
    } finally {
      this.busy = false;
      this.controller = null;
      if (!this.disposed) {
        this.setState({ ...this.state, inFlight: false });
        const next = this.pending;
        this.pending = null;
        if (next) void this.run(next);
      }
    }
  }

  private setState(next: PerceptionState): void {
    if (next === this.state) return;
    this.state = next;
    for (const listener of this.listeners) listener();
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
