import type { CapturedFrame } from "./frame-capture";

/**
 * Receives captured frames. The real consumer (Phase 4+) will hand frames to
 * the perception pipeline; consumers must treat the blob as transient and
 * must not persist it.
 */
export interface FrameConsumer {
  consume(frame: CapturedFrame): void | Promise<void>;
}

export interface FrameMetadata {
  sequence: number;
  width: number;
  height: number;
  bytes: number;
  mimeType: string;
  capturedAt: number;
}

export function frameMetadata(frame: CapturedFrame): FrameMetadata {
  return {
    sequence: frame.sequence,
    width: frame.width,
    height: frame.height,
    bytes: frame.blob.size,
    mimeType: frame.mimeType,
    capturedAt: frame.capturedAt,
  };
}

/**
 * Mock consumer: logs metadata only (never pixels) and only outside
 * production. The frame is dropped as soon as `consume` returns.
 */
export function createDevLoggingConsumer(
  log: (message: string, metadata: FrameMetadata) => void = (m, d) =>
    console.debug(m, d),
  enabled: boolean = process.env.NODE_ENV !== "production",
): FrameConsumer {
  return {
    consume(frame) {
      if (enabled) log("[camera] frame", frameMetadata(frame));
    },
  };
}
