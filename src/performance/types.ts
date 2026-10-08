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
}

export interface PerformanceEvent {
  readonly kind:
    | "frame_captured"
    | "ai_request_start"
    | "ai_request_end"
    | "ai_request_fail"
    | "safety_assessed"
    | "speech_dispatched"
    | "gps_update";
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
};
