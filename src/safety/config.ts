export interface SafetyConfig {
  readonly perceptionStaleMs: number;
  readonly locationStaleMs: number;
  readonly assessmentTtlMs: number;
  readonly lowConfidenceThreshold: number;
}

export const SAFETY_CONFIG: SafetyConfig = {
  perceptionStaleMs: 10_000,
  locationStaleMs: 15_000,
  assessmentTtlMs: 3_000,
  lowConfidenceThreshold: 0.3,
};
