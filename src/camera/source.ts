import { z } from "zod";

/**
 * Normalized camera frame that every consumer sees, regardless of whether the
 * pixels came from a browser MediaStream, a USB camera, a Raspberry Pi CSI, or
 * a Jetson. Browser-specific objects (MediaStream, HTMLVideoElement) never leak
 * past the source adapter.
 */

export const CameraFrameOrientationSchema = z.enum([
  "landscape",
  "portrait",
  "unknown",
]);

export const CameraFrameSourceKindSchema = z.enum([
  "browser",
  "mobile",
  "external",
  "fixture",
  "unknown",
]);

export const CameraFrameSchema = z.object({
  id: z.number().int().min(0),
  timestamp: z.number().min(0),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  orientation: CameraFrameOrientationSchema,
  source: CameraFrameSourceKindSchema,
  data: z.instanceof(Blob),
});

export type CameraFrameOrientation = z.infer<
  typeof CameraFrameOrientationSchema
>;
export type CameraFrameSourceKind = z.infer<typeof CameraFrameSourceKindSchema>;
export type CameraFrame = z.infer<typeof CameraFrameSchema>;

export type CameraSourceState =
  "idle" | "starting" | "active" | "paused" | "error" | "stopped";

export interface CameraSourceSnapshot {
  readonly state: CameraSourceState;
  readonly error: string | null;
}

export const INITIAL_SOURCE_SNAPSHOT: CameraSourceSnapshot = {
  state: "idle",
  error: null,
};

/**
 * Where frames come from. The perception pipeline, safety engine, and every
 * other consumer see only `CameraFrame` — never browser MediaStream objects,
 * USB device handles, or CSI/V4L2 file descriptors.
 *
 * Implementations today:
 * - `BrowserCameraSource` — wraps the existing CameraController + FrameCapture
 *
 * Planned (not yet implemented):
 * - `MobileCameraSource` — React Native / Capacitor bridge
 * - `ExternalCameraSource` — WebUSB, WebSocket relay, or native bridge
 */
export interface CameraSource {
  readonly kind: CameraFrameSourceKind;

  subscribe(listener: () => void): () => void;
  getSnapshot(): CameraSourceSnapshot;

  start(): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;

  captureFrame(signal?: AbortSignal): Promise<CameraFrame>;

  dispose(): void;
}
