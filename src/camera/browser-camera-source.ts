import { CameraController, type CameraSnapshot } from "./controller";
import { FrameCapture, type FrameCaptureCallOptions } from "./frame-capture";
import type {
  CameraFrame,
  CameraFrameOrientation,
  CameraSource,
  CameraSourceSnapshot,
  CameraSourceState,
} from "./source";

function mapState(camera: CameraSnapshot): CameraSourceState {
  switch (camera.state) {
    case "idle":
      return "idle";
    case "requesting_permission":
      return "starting";
    case "active":
      return "active";
    case "paused":
      return "paused";
    case "error":
      return "error";
    case "unsupported":
      return "error";
    default:
      return "idle";
  }
}

function orientationOf(width: number, height: number): CameraFrameOrientation {
  if (width > height) return "landscape";
  if (height > width) return "portrait";
  return "unknown";
}

export interface BrowserCameraSourceDeps {
  captureOptions?: Partial<FrameCaptureCallOptions>;
}

/**
 * Adapts the existing browser camera subsystem (`CameraController` +
 * `FrameCapture`) to the source-agnostic `CameraSource` interface.
 *
 * All browser-specific objects — `MediaStream`, `HTMLVideoElement`,
 * `getUserMedia` constraints — are confined to this adapter and the modules
 * it delegates to. Consumers see only `CameraFrame`.
 */
export class BrowserCameraSource implements CameraSource {
  readonly kind = "browser" as const;

  private readonly camera: CameraController;
  private readonly frameCapture: FrameCapture;
  private readonly captureOptions: Partial<FrameCaptureCallOptions>;
  private sequence = 0;
  private snapshot: CameraSourceSnapshot = {
    state: "idle",
    error: null,
  };

  constructor(deps: BrowserCameraSourceDeps = {}) {
    this.camera = new CameraController();
    this.frameCapture = new FrameCapture(() => this.camera.getActiveVideo());
    this.captureOptions = deps.captureOptions ?? {};
  }

  subscribe(listener: () => void): () => void {
    return this.camera.subscribe(listener);
  }

  getSnapshot(): CameraSourceSnapshot {
    const snap = this.camera.getSnapshot();
    const mappedState = mapState(snap);
    const errorMsg = snap.error?.message ?? null;
    if (
      this.snapshot.state !== mappedState ||
      this.snapshot.error !== errorMsg
    ) {
      this.snapshot = {
        state: mappedState,
        error: errorMsg,
      };
    }
    return this.snapshot;
  }

  async start(): Promise<void> {
    await this.camera.start();
  }

  stop(): void {
    this.camera.stop();
  }

  pause(): void {
    this.camera.pause();
  }

  resume(): void {
    this.camera.resume();
  }

  async captureFrame(signal?: AbortSignal): Promise<CameraFrame> {
    const captured = await this.frameCapture.captureFrame({
      ...this.captureOptions,
      ...(signal ? { signal } : {}),
    });
    return {
      id: ++this.sequence,
      timestamp: captured.capturedAt,
      width: captured.width,
      height: captured.height,
      orientation: orientationOf(captured.width, captured.height),
      source: "browser",
      data: captured.blob,
    };
  }

  attachVideo(element: HTMLVideoElement | null): void {
    this.camera.attachVideo(element);
  }

  getActiveVideo(): HTMLVideoElement | null {
    return this.camera.getActiveVideo();
  }

  async switchCamera(): Promise<boolean> {
    return this.camera.switchCamera();
  }

  get canSwitch(): boolean {
    return this.camera.getSnapshot().canSwitch;
  }

  dispose(): void {
    this.camera.stop();
  }
}
