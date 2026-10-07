/**
 * Perception pipeline constants. Image limits are enforced server-side before
 * any model call so a malformed or oversized frame is rejected cheaply.
 */

/** Image MIME types the analyze endpoint will accept. */
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/** Largest decoded image accepted (bytes). ~4 MB covers a 1024px JPEG easily. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Smallest plausible encoded image; anything tinier is treated as malformed. */
export const MIN_IMAGE_BYTES = 64;

/** Endpoint the browser posts frames to. */
export const ANALYZE_ENDPOINT = "/api/vision/analyze";

/** Default client-side budget for a single analyze request. */
export const DEFAULT_ANALYZE_TIMEOUT_MS = 10_000;

export function isAllowedImageMimeType(
  value: string,
): value is AllowedImageMimeType {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(value);
}
