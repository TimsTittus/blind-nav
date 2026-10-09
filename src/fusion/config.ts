export interface FusionConfig {
  /** A cloud analysis older than this stops counting as current evidence (ms). */
  readonly cloudFreshMs: number;
  /** A local frame older than this stops counting as current evidence (ms). */
  readonly localFreshMs: number;
}

/**
 * The cloud window is wide because the cloud path runs at 0.5–2 FPS and its
 * semantic findings stay true longer; the local window is tight because its
 * whole purpose is immediacy. Both are starting values, not validated ones.
 */
export const FUSION_CONFIG: FusionConfig = {
  cloudFreshMs: 3_000,
  localFreshMs: 1_000,
};
