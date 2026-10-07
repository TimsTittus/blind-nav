/**
 * Tunable camera / frame-capture constants. Nothing here is hardcoded in UI
 * components; callers override per use via options.
 */

export const FRAME_CAPTURE_DEFAULTS = {
  /** ~1 frame per second: conservative cadence for AI analysis. */
  intervalMs: 1000,
  /** Bounding box; frames are scaled down to fit, never up. */
  maxWidth: 1024,
  maxHeight: 1024,
  /** JPEG quality, 0..1. */
  quality: 0.7,
  mimeType: "image/jpeg",
} as const;

/** Hard limits so a bad config can't pin the CPU or produce huge frames. */
export const FRAME_CAPTURE_LIMITS = {
  minIntervalMs: 100,
  maxDimension: 4096,
} as const;

/** The scheduler stops itself after this many failures in a row. */
export const SCHEDULER_MAX_CONSECUTIVE_ERRORS = 5;

/** Preferred stream size. `ideal`, so devices that can't match still work. */
export const CAMERA_IDEAL_RESOLUTION = { width: 1280, height: 720 } as const;
