/** Development-only performance metrics. Never sent externally. */
export interface PerformanceMetrics {
  readonly cameraFPS: number;
  readonly captureLatencyMs: number | null;
  readonly aiLatencyMs: number | null;
  readonly aiRequestsPerMinute: number;
  readonly aiFailureRate: number;
  readonly perceptionAgeMs: number | null;
  readonly gpsAccuracy: number | null;
  readonly gpsAgeMs: number | null;
  readonly speechQueueLength: number;
  readonly endToEndLatencyMs: number | null;
  /** Completed local inferences per second over the window. */
  readonly localFPS: number;
  /** Last local model time (ms). */
  readonly localLatencyMs: number | null;
  /** Median local model time over the window (ms). */
  readonly localMedianLatencyMs: number | null;
  /** Local inference failures / attempts over the window. */
  readonly localFailureRate: number;
  /** Share of wall-clock time spent inside local inference, 0..1. */
  readonly localDutyCycle: number;
  /**
   * JS heap in MB where the browser exposes it (Chromium only, and only under
   * cross-origin isolation for precise values). `null` elsewhere — it is a
   * whole-tab figure, never a per-model measurement.
   */
  readonly jsHeapMB: number | null;
}

export interface PerformanceEvent {
  readonly kind:
    | "frame_captured"
    | "ai_request_start"
    | "ai_request_end"
    | "ai_request_fail"
    | "safety_assessed"
    | "speech_dispatched"
    | "gps_update"
    | "local_inference"
    | "local_inference_fail";
  readonly timestamp: number;
  readonly durationMs?: number;
  readonly metadata?: Record<string, unknown>;
}

export const EMPTY_METRICS: PerformanceMetrics = {
  cameraFPS: 0,
  captureLatencyMs: null,
  aiLatencyMs: null,
  aiRequestsPerMinute: 0,
  aiFailureRate: 0,
  perceptionAgeMs: null,
  gpsAccuracy: null,
  gpsAgeMs: null,
  speechQueueLength: 0,
  endToEndLatencyMs: null,
  localFPS: 0,
  localLatencyMs: null,
  localMedianLatencyMs: null,
  localFailureRate: 0,
  localDutyCycle: 0,
  jsHeapMB: null,
};
