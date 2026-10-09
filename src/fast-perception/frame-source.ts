/**
 * Pixel grab for the local loop.
 *
 * Deliberately separate from `camera/frame-capture.ts`: that one encodes a
 * `Blob` (and then a base64 data URL) because the frame has to cross the
 * network to the cloud provider. Local inference runs in this tab, so encoding
 * would be pure overhead on every frame — several times the cost of the
 * inference itself at these sizes. This path draws straight into a reused
 * offscreen canvas at the model's input size and reads the pixels back.
 *
 * Nothing here persists a frame; the buffer is handed to the backend and
 * overwritten by the next grab.
 */
import type { RgbaFrame } from "./backend";

export type FastFrameErrorKind =
  "source_unavailable" | "not_ready" | "read_failed";

export class FastFrameError extends Error {
  readonly kind: FastFrameErrorKind;
  constructor(kind: FastFrameErrorKind, message: string) {
    super(message);
    this.name = "FastFrameError";
    this.kind = kind;
  }
}

type VideoSource = Pick<
  HTMLVideoElement,
  "videoWidth" | "videoHeight" | "readyState"
>;

interface Canvas2d {
  drawImage(
    source: never,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  getImageData(x: number, y: number, w: number, h: number): ImageData;
}

interface CanvasLike {
  width: number;
  height: number;
  getContext(
    id: "2d",
    options?: { willReadFrequently?: boolean },
  ): Canvas2d | null;
}

const HAVE_CURRENT_DATA = 2;

export interface FastFrameSourceDeps {
  createCanvas?: () => CanvasLike;
}

export class FastFrameSource {
  private readonly getSource: () => VideoSource | null;
  private readonly createCanvas: () => CanvasLike;
  private canvas: CanvasLike | null = null;
  private context: Canvas2d | null = null;

  constructor(
    getSource: () => VideoSource | null,
    deps: FastFrameSourceDeps = {},
  ) {
    this.getSource = getSource;
    this.createCanvas =
      deps.createCanvas ??
      (() => document.createElement("canvas") as unknown as CanvasLike);
  }

  /**
   * Grab a centre-cropped square and scale it to `size`. Cropping rather than
   * squashing keeps the corridor geometry in `grid.ts` meaningful: the answer
   * rules assume the bottom-centre of the frame is the ground ahead.
   */
  grab = (size: number): RgbaFrame => {
    const source = this.getSource();
    if (!source) {
      throw new FastFrameError(
        "source_unavailable",
        "No live camera to read from.",
      );
    }
    if (
      source.readyState < HAVE_CURRENT_DATA ||
      !source.videoWidth ||
      !source.videoHeight
    ) {
      throw new FastFrameError("not_ready", "Camera has no frame yet.");
    }

    const canvas = (this.canvas ??= this.createCanvas());
    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = size;
      canvas.height = size;
      this.context = null;
    }
    const context = (this.context ??= canvas.getContext("2d", {
      willReadFrequently: true,
    }));
    if (!context) {
      throw new FastFrameError("read_failed", "Canvas is unavailable.");
    }

    const edge = Math.min(source.videoWidth, source.videoHeight);
    const sx = (source.videoWidth - edge) / 2;
    const sy = (source.videoHeight - edge) / 2;
    context.drawImage(source as never, sx, sy, edge, edge, 0, 0, size, size);
    const capturedAt = Date.now();

    let imageData: ImageData;
    try {
      imageData = context.getImageData(0, 0, size, size);
    } catch (cause) {
      throw new FastFrameError(
        "read_failed",
        `Could not read pixels: ${cause instanceof Error ? cause.message : "unknown error"}`,
      );
    }

    return {
      data: imageData.data,
      width: size,
      height: size,
      capturedAt,
    };
  };
}
