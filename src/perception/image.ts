import { InvalidImageError } from "@/core";
import {
  isAllowedImageMimeType,
  MAX_IMAGE_BYTES,
  MIN_IMAGE_BYTES,
} from "./config";

export interface DecodedImage {
  mimeType: string;
  /** Decoded size of the image in bytes. */
  byteLength: number;
  /** The base64 payload (without the `data:` prefix). */
  base64: string;
}

const DATA_URL_RE = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/;

/** Decoded byte length of a base64 string without allocating the buffer. */
export function base64ByteLength(base64: string): number {
  const len = base64.length;
  if (len === 0) return 0;
  let padding = 0;
  if (base64.endsWith("==")) padding = 2;
  else if (base64.endsWith("=")) padding = 1;
  return Math.floor((len * 3) / 4) - padding;
}

/**
 * Validate a frame `data:` URL and return its decoded size and MIME type.
 * Rejects anything that is not a base64 image data URL, of an unsupported MIME
 * type, or outside the allowed size bounds. Throws {@link InvalidImageError}.
 *
 * This is the server-side image trust boundary: it runs before any model call.
 */
export function decodeImageDataUrl(dataUrl: unknown): DecodedImage {
  if (typeof dataUrl !== "string" || dataUrl.length === 0) {
    throw new InvalidImageError("No image was supplied.");
  }
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match) {
    throw new InvalidImageError("The image must be a base64-encoded data URL.");
  }
  const mimeType = match[1] ?? "";
  const base64 = match[2] ?? "";

  if (!isAllowedImageMimeType(mimeType)) {
    throw new InvalidImageError(`Unsupported image type: ${mimeType}.`, {
      detail: "Allowed types are JPEG, PNG, and WebP.",
    });
  }

  const byteLength = base64ByteLength(base64);
  if (byteLength < MIN_IMAGE_BYTES) {
    throw new InvalidImageError("The image is empty or truncated.");
  }
  if (byteLength > MAX_IMAGE_BYTES) {
    throw new InvalidImageError("The image is too large.", {
      detail: `Maximum size is ${MAX_IMAGE_BYTES} bytes.`,
    });
  }

  return { mimeType, byteLength, base64 };
}
