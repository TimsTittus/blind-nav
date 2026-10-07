import {
  FRAME_CAPTURE_DEFAULTS,
  FRAME_CAPTURE_LIMITS,
  SCHEDULER_MAX_CONSECUTIVE_ERRORS,
} from "./config";
import { documentVisibility, type VisibilitySource } from "./visibility";

export type SchedulerState = "stopped" | "running" | "paused";

export interface FrameSchedulerOptions<T> {
  /** Produce one frame. Should honour `signal` but need not. */
  capture: (signal: AbortSignal) => Promise<T>;
  /** Receives each frame. Not awaited: a slow consumer can't delay capture. */
  onFrame: (frame: T) => void | Promise<void>;
  onError?: (error: unknown) => void;
  onStateChange?: (state: SchedulerState) => void;
  intervalMs?: number;
  /** Stop after this many consecutive failures (a broken source). */
  maxConsecutiveErrors?: number;
  /** Aborting stops the scheduler for good. */
  signal?: AbortSignal;
  /** Pass `null` to ignore tab visibility. Defaults to the document. */
  visibility?: VisibilitySource | null;
}

/**
 * Fixed-delay capture loop.
 *
 * - Never overlaps: the next job is scheduled only after the previous one
 *   settles (so there is no `setInterval` pile-up under slow capture).
 * - `pause`/`stop`/hidden-tab abort the in-flight job's signal and discard its
 *   result even if `capture` ignores the signal; a late result can never be
 *   delivered after the scheduler stopped.
 * - Errors are reported and the loop continues until
 *   `maxConsecutiveErrors` is hit, then it stops itself.
 */
export class FrameScheduler<T> {
  private readonly options: FrameSchedulerOptions<T>;
  private readonly intervalMs: number;
  private readonly maxErrors: number;
  private readonly visibility: VisibilitySource | null;

  private started = false;
  private manualPause = false;
  private hidden = false;
  private current: SchedulerState = "stopped";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private generation = 0;
  private jobAbort: AbortController | null = null;
  private errors = 0;
  private cleanups: Array<() => void> = [];

  constructor(options: FrameSchedulerOptions<T>) {
    this.options = options;
    this.intervalMs = Math.max(
      FRAME_CAPTURE_LIMITS.minIntervalMs,
      options.intervalMs ?? FRAME_CAPTURE_DEFAULTS.intervalMs,
    );
    this.maxErrors =
      options.maxConsecutiveErrors ?? SCHEDULER_MAX_CONSECUTIVE_ERRORS;
    this.visibility =
      options.visibility === undefined
        ? documentVisibility()
        : options.visibility;
  }

  get state(): SchedulerState {
    return this.current;
  }

  /** A capture job is currently running. */
  get busy(): boolean {
    return this.inFlight;
  }

  start(): void {
    if (this.started || this.options.signal?.aborted) return;
    this.started = true;
    this.manualPause = false;
    this.errors = 0;

    const { signal, visibility } = {
      ...this.options,
      visibility: this.visibility,
    };
    if (signal) {
      const onAbort = () => this.stop();
      signal.addEventListener("abort", onAbort, { once: true });
      this.cleanups.push(() => signal.removeEventListener("abort", onAbort));
    }
    if (visibility) {
      this.hidden = visibility.isHidden();
      this.cleanups.push(
        visibility.subscribe(() => {
          this.hidden = visibility.isHidden();
          this.update();
        }),
      );
    }
    this.update();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.cleanups.forEach((cleanup) => cleanup());
    this.cleanups = [];
    this.update();
  }

  pause(): void {
    this.manualPause = true;
    this.update();
  }

  resume(): void {
    this.manualPause = false;
    this.update();
  }

  private desired(): SchedulerState {
    if (!this.started) return "stopped";
    return this.manualPause || this.hidden ? "paused" : "running";
  }

  private update(): void {
    const next = this.desired();
    const changed = next !== this.current;
    this.current = next;

    if (next !== "running") {
      this.clearTimer();
      // Invalidate whatever is in flight; its result will be discarded.
      this.generation++;
      this.jobAbort?.abort();
    } else if (!this.timer && !this.inFlight) {
      this.schedule(0);
    }
    if (changed) this.options.onStateChange?.(next);
  }

  private schedule(delay: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async run(): Promise<void> {
    if (this.current !== "running" || this.inFlight) return;
    this.inFlight = true;
    const generation = this.generation;
    const abort = new AbortController();
    this.jobAbort = abort;
    const startedAt = Date.now();

    try {
      const frame = await this.options.capture(abort.signal);
      if (generation === this.generation && !abort.signal.aborted) {
        this.errors = 0;
        this.deliver(frame);
      }
    } catch (error) {
      if (generation === this.generation && !abort.signal.aborted) {
        this.fail(error);
      }
    } finally {
      this.inFlight = false;
      if (this.jobAbort === abort) this.jobAbort = null;
      if (this.current === "running" && !this.timer) {
        this.schedule(Math.max(0, this.intervalMs - (Date.now() - startedAt)));
      }
    }
  }

  private deliver(frame: T): void {
    try {
      const result = this.options.onFrame(frame);
      if (result instanceof Promise) result.catch((e) => this.report(e));
    } catch (error) {
      this.report(error);
    }
  }

  private fail(error: unknown): void {
    this.report(error);
    if (++this.errors >= this.maxErrors) this.stop();
  }

  private report(error: unknown): void {
    this.options.onError?.(error);
  }
}
