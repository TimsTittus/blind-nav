export interface SessionControllerConfig {
  /** Minimum interval between AI analysis requests (ms). */
  readonly analysisIntervalMs: number;
  /** Analysis result younger than this is "fresh" (ms). */
  readonly freshThresholdMs: number;
  /** Analysis result between fresh and stale is "aging" (ms). */
  readonly agingThresholdMs: number;
  /** Analysis result older than this is "stale" (ms). */
  readonly staleThresholdMs: number;
  /** How long a safety assessment remains valid (ms). */
  readonly safetyTtlMs: number;
  /** Minimum gap between repeated navigation speech (ms). */
  readonly navigationSpeechCooldownMs: number;
  /** Minimum gap between repeated safety speech of the same level (ms). */
  readonly safetySpeechCooldownMs: number;
}

export const SESSION_CONTROLLER_CONFIG: SessionControllerConfig = {
  analysisIntervalMs: 1_000,
  freshThresholdMs: 3_000,
  agingThresholdMs: 7_000,
  staleThresholdMs: 10_000,
  safetyTtlMs: 3_000,
  navigationSpeechCooldownMs: 5_000,
  safetySpeechCooldownMs: 3_000,
};
