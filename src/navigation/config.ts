export const LOCATION_CONFIG = {
  staleThresholdMs: 15_000,
  poorAccuracyMeters: 50,
  offRouteThresholdMeters: 30,
  offRouteDebounceMs: 5_000,
  arrivalThresholdMeters: 15,
  stepAdvanceMeters: 20,
  highAccuracy: true,
  maxAgeMs: 5_000,
  timeoutMs: 10_000,
} as const;
