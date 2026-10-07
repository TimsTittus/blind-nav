import { z } from "zod";
import { FRAME_CAPTURE_DEFAULTS, FRAME_CAPTURE_LIMITS } from "./config";

const dimension = z
  .number()
  .int()
  .positive()
  .max(FRAME_CAPTURE_LIMITS.maxDimension);

export const FrameCaptureOptionsSchema = z.object({
  maxWidth: dimension,
  maxHeight: dimension,
  /** 0..1; ignored by lossless types such as image/png. */
  quality: z.number().min(0).max(1),
  mimeType: z.enum(["image/jpeg", "image/webp", "image/png"]),
});
export type FrameCaptureOptions = z.infer<typeof FrameCaptureOptionsSchema>;

export type FrameCaptureCallOptions = Partial<FrameCaptureOptions> & {
  signal?: AbortSignal;
};

/** An encoded frame. Binary only — no base64, never persisted by this module. */
export interface CapturedFrame {
  blob: Blob;
  width: number;
  height: number;
  mimeType: string;
  /** `Date.now()` when the pixels were read from the video. */
  capturedAt: number;
  /** Monotonic per `FrameCapture`; lets consumers drop stale results. */
  sequence: number;
}

export type FrameCaptureErrorKind =
  "source_unavailable" | "not_ready" | "encode_failed" | "aborted";

export class FrameCaptureError extends Error {
  readonly kind: FrameCaptureErrorKind;
  constructor(kind: FrameCaptureErrorKind, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "FrameCaptureError";
    this.kind = kind;
  }
}

/** Scale to fit the box, preserving aspect ratio. Never upscales. */
export function fitWithin(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

type VideoSource = Pick<
  HTMLVideoElement,
  "videoWidth" | "videoHeight" | "readyState"
>;

interface CanvasLike {
  width: number;
  height: number;
  getContext(id: "2d"): {
    drawImage(source: never, x: number, y: number, w: number, h: number): void;
  } | null;
  toBlob(
    cb: (blob: Blob | null) => void,
    type?: string,
    quality?: number,
  ): void;
}

export interface FrameCaptureDeps {
  createCanvas?: () => CanvasLike;
}

const HAVE_CURRENT_DATA = 2;

/**
 * Controlled, on-demand frame grabber. It never runs by itself — a caller (the
 * scheduler) decides when to capture, so nothing is streamed anywhere.
 *
 * The scratch canvas is reused: `toBlob` snapshots the bitmap synchronously,
 * so overlapping calls cannot corrupt each other.
 */
export class FrameCapture {
  private readonly getSource: () => VideoSource | null;
  private readonly createCanvas: () => CanvasLike;
  private canvas: CanvasLike | null = null;
  private sequence = 0;

  constructor(
    getSource: () => VideoSource | null,
    deps: FrameCaptureDeps = {},
  ) {
    this.getSource = getSource;
    this.createCanvas =
      deps.createCanvas ??
      (() => document.createElement("canvas") as unknown as CanvasLike);
  }

  /** Arrow property so it can be passed around as a bare callback. */
  captureFrame = async (
    options: FrameCaptureCallOptions = {},
  ): Promise<CapturedFrame> => {
    const { signal, ...overrides } = options;
    const config = FrameCaptureOptionsSchema.parse({
      ...FRAME_CAPTURE_DEFAULTS,
      ...overrides,
    });
    throwIfAborted(signal);

    const source = this.getSource();
    if (!source) {
      throw new FrameCaptureError(
        "source_unavailable",
        "No live camera to capture from.",
      );
    }
    if (
      source.readyState < HAVE_CURRENT_DATA ||
      !source.videoWidth ||
      !source.videoHeight
    ) {
      throw new FrameCaptureError("not_ready", "Camera has no frame yet.");
    }

    const { width, height } = fitWithin(
      source.videoWidth,
      source.videoHeight,
      config.maxWidth,
      config.maxHeight,
    );
    const canvas = (this.canvas ??= this.createCanvas());
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new FrameCaptureError("encode_failed", "Canvas is unavailable.");
    }
    context.drawImage(source as never, 0, 0, width, height);
    const capturedAt = Date.now();
    const sequence = ++this.sequence;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, config.mimeType, config.quality),
    );
    throwIfAborted(signal);
    if (!blob) {
      throw new FrameCaptureError("encode_failed", "Frame encoding failed.");
    }
    return {
      blob,
      width,
      height,
      mimeType: blob.type || config.mimeType,
      capturedAt,
      sequence,
    };
  };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new FrameCaptureError("aborted", "Frame capture was aborted.");
  }
}
