import type { PerformanceMetrics } from "./types";

const WINDOW_MS = 60_000;
const MAX_TIMESTAMPS = 300;
const PRUNE_INTERVAL_MS = 30_000;

interface TimestampedEntry {
  readonly timestamp: number;
  readonly durationMs?: number;
}

/**
 * Development-only performance monitor. Collects pipeline metrics without
 * sending any telemetry externally. All data stays in-process.
 *
 * Bounded: timestamp arrays are pruned on a 30-second interval and capped
 * at 300 entries (5 minutes at 1 FPS).
 */
export class PerformanceMonitor {
  private readonly now: () => number;

  private frameTimestamps: number[] = [];
  private lastCaptureLatencyMs: number | null = null;

  private aiRequests: TimestampedEntry[] = [];
  private aiFailures: number[] = [];
  private lastAiLatencyMs: number | null = null;

  private lastPerceptionAt: number | null = null;
  private lastSpeechDispatchAt: number | null = null;

  private lastGpsAccuracy: number | null = null;
  private lastGpsAt: number | null = null;

  private speechQueueLength = 0;

  private lastFrameCapturedAt: number | null = null;
  private lastEndToEndLatencyMs: number | null = null;

  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options?: { now?: () => number }) {
    this.now = options?.now ?? (() => Date.now());
  }

  start(): void {
    if (this.pruneTimer) return;
    this.pruneTimer = setInterval(() => this.prune(), PRUNE_INTERVAL_MS);
  }

  stop(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
  }

  dispose(): void {
    this.stop();
    this.reset();
  }

  reset(): void {
    this.frameTimestamps = [];
    this.lastCaptureLatencyMs = null;
    this.aiRequests = [];
    this.aiFailures = [];
    this.lastAiLatencyMs = null;
    this.lastPerceptionAt = null;
    this.lastSpeechDispatchAt = null;
    this.lastGpsAccuracy = null;
    this.lastGpsAt = null;
    this.speechQueueLength = 0;
    this.lastFrameCapturedAt = null;
    this.lastEndToEndLatencyMs = null;
  }

  recordFrameCapture(captureLatencyMs: number): void {
    const now = this.now();
    this.frameTimestamps.push(now);
    this.lastCaptureLatencyMs = captureLatencyMs;
    this.lastFrameCapturedAt = now;
    this.trimArray(this.frameTimestamps);
  }

  recordAiRequestStart(): number {
    return this.now();
  }

  recordAiRequestEnd(startedAt: number): void {
    const now = this.now();
    const durationMs = now - startedAt;
    this.aiRequests.push({ timestamp: now, durationMs });
    this.lastAiLatencyMs = durationMs;
    this.lastPerceptionAt = now;
    this.trimEntries(this.aiRequests);
  }

  recordAiFailure(): void {
    const now = this.now();
    this.aiFailures.push(now);
    this.aiRequests.push({ timestamp: now });
    this.trimArray(this.aiFailures);
    this.trimEntries(this.aiRequests);
  }

  recordSafetyAssessed(): void {
    // Timestamp recorded for end-to-end latency chain; no dedicated field needed.
  }

  recordSpeechDispatched(): void {
    this.lastSpeechDispatchAt = this.now();
    if (this.lastFrameCapturedAt !== null) {
      this.lastEndToEndLatencyMs =
        this.lastSpeechDispatchAt - this.lastFrameCapturedAt;
    }
  }

  recordGpsUpdate(accuracy: number | null): void {
    this.lastGpsAccuracy = accuracy;
    this.lastGpsAt = this.now();
  }

  recordSpeechQueueLength(length: number): void {
    this.speechQueueLength = length;
  }

  getMetrics(): PerformanceMetrics {
    const now = this.now();
    const cutoff = now - WINDOW_MS;

    const recentFrames = countSince(this.frameTimestamps, cutoff);
    const elapsedSeconds = Math.min(
      (now - (this.frameTimestamps[0] ?? now)) / 1_000,
      60,
    );
    const cameraFPS =
      elapsedSeconds > 0
        ? Math.round((recentFrames / elapsedSeconds) * 10) / 10
        : 0;

    const recentAiRequests = this.aiRequests.filter(
      (e) => e.timestamp > cutoff,
    );
    const recentAiFailures = countSince(this.aiFailures, cutoff);
    const aiRequestsPerMinute = recentAiRequests.length;
    const aiFailureRate =
      recentAiRequests.length > 0
        ? Math.round((recentAiFailures / recentAiRequests.length) * 100) / 100
        : 0;

    const perceptionAgeMs =
      this.lastPerceptionAt !== null ? now - this.lastPerceptionAt : null;

    const gpsAgeMs = this.lastGpsAt !== null ? now - this.lastGpsAt : null;

    return {
      cameraFPS,
      captureLatencyMs: this.lastCaptureLatencyMs,
      aiLatencyMs: this.lastAiLatencyMs,
      aiRequestsPerMinute,
      aiFailureRate,
      perceptionAgeMs,
      gpsAccuracy: this.lastGpsAccuracy,
      gpsAgeMs,
      speechQueueLength: this.speechQueueLength,
      endToEndLatencyMs: this.lastEndToEndLatencyMs,
    };
  }

  private prune(): void {
    const cutoff = this.now() - WINDOW_MS;
    this.frameTimestamps = this.frameTimestamps.filter((t) => t > cutoff);
    this.aiRequests = this.aiRequests.filter((e) => e.timestamp > cutoff);
    this.aiFailures = this.aiFailures.filter((t) => t > cutoff);
  }

  private trimArray(arr: number[]): void {
    if (arr.length > MAX_TIMESTAMPS) {
      arr.splice(0, arr.length - MAX_TIMESTAMPS);
    }
  }

  private trimEntries(arr: TimestampedEntry[]): void {
    if (arr.length > MAX_TIMESTAMPS) {
      arr.splice(0, arr.length - MAX_TIMESTAMPS);
    }
  }
}

function countSince(timestamps: number[], cutoff: number): number {
  let count = 0;
  for (let i = timestamps.length - 1; i >= 0; i--) {
    if (timestamps[i]! > cutoff) count++;
    else break;
  }
  return count;
}
