import { CAMERA_IDEAL_RESOLUTION } from "./config";
import {
  classifyCameraError,
  errorName,
  DEVICE_LOST_ERROR,
  UNSUPPORTED_ERROR,
  type CameraError,
} from "./errors";
import {
  holdsStream,
  transitionCamera,
  type CameraEvent,
  type CameraState,
} from "./state";
import { documentVisibility, type VisibilitySource } from "./visibility";

export type CameraFacing = "environment" | "user" | "unknown";

export interface CameraSnapshot {
  state: CameraState;
  error: CameraError | null;
  facing: CameraFacing;
  /** More than one video input is available. */
  canSwitch: boolean;
  switching: boolean;
}

export const INITIAL_CAMERA_SNAPSHOT: CameraSnapshot = {
  state: "idle",
  error: null,
  facing: "unknown",
  canSwitch: false,
  switching: false,
};

type MediaDevicesLike = Pick<MediaDevices, "getUserMedia" | "enumerateDevices">;

export interface CameraControllerDeps {
  /** Defaults to `navigator.mediaDevices`, read lazily. */
  mediaDevices?: MediaDevicesLike | undefined;
  /** Defaults to the document's visibility. */
  visibility?: VisibilitySource;
}

type PauseReason = "manual" | "hidden";

/**
 * Owns one camera stream and its lifecycle. Framework-agnostic: React reads it
 * through `subscribe`/`getSnapshot` (see `useCamera`).
 *
 * Invariants:
 * - Tracks are stopped on `stop()`, on failure, on switch, and when a request
 *   is superseded — the stream never outlives the session.
 * - `start()` is idempotent while requesting/active/paused.
 * - A `token` invalidates in-flight async work after `stop()`, so a late
 *   `getUserMedia` result is released immediately instead of adopted.
 * - Pause reasons (manual, tab hidden) are tracked separately: the camera
 *   resumes only once all of them are cleared.
 */
export class CameraController {
  private readonly deps: CameraControllerDeps;
  private snapshot: CameraSnapshot = INITIAL_CAMERA_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private token = 0;
  private readonly pauseReasons = new Set<PauseReason>();
  private unwatchVisibility: (() => void) | null = null;
  private videoDeviceIds: string[] = [];

  constructor(deps: CameraControllerDeps = {}) {
    this.deps = deps;
  }

  // --- external-store surface (stable references for useSyncExternalStore) --

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): CameraSnapshot => this.snapshot;

  // --- video element --------------------------------------------------------

  /** Bind (or unbind with `null`) the `<video>` that renders the stream. */
  attachVideo(video: HTMLVideoElement | null): void {
    if (this.video === video) return;
    if (this.video) this.video.srcObject = null;
    this.video = video;
    this.bindVideo();
  }

  /** The video element, only while frames are live (active, not paused). */
  getActiveVideo(): HTMLVideoElement | null {
    return this.snapshot.state === "active" ? this.video : null;
  }

  // --- lifecycle ------------------------------------------------------------

  async start(): Promise<void> {
    const { state } = this.snapshot;
    if (
      state === "requesting_permission" ||
      state === "active" ||
      state === "paused"
    ) {
      return;
    }
    if (!this.mediaDevices()?.getUserMedia) {
      this.apply({ type: "UNSUPPORTED" }, { error: UNSUPPORTED_ERROR });
      return;
    }

    const token = ++this.token;
    this.pauseReasons.clear();
    this.watchVisibility();
    this.apply(
      { type: "REQUEST" },
      { error: null, canSwitch: false, switching: false },
    );

    let stream: MediaStream;
    try {
      stream = await this.acquire();
    } catch (error) {
      if (token !== this.token) return;
      this.fail(classifyCameraError(error));
      return;
    }
    if (token !== this.token) {
      stopTracks(stream);
      return;
    }

    this.adopt(stream);
    await this.refreshDevices();
    if (token !== this.token) return;
    this.apply(
      { type: "GRANTED", paused: this.pauseReasons.size > 0 },
      { facing: this.currentFacing(), canSwitch: this.canSwitch() },
    );
  }

  /** Releases every track and returns to `idle`. Safe to call at any time. */
  stop(): void {
    this.token++;
    this.releaseAll();
    this.pauseReasons.clear();
    this.apply({ type: "STOP" }, { ...INITIAL_CAMERA_SNAPSHOT });
  }

  /** Pause (e.g. user pressed PAUSE). Frames stop; the stream is retained. */
  pause(): void {
    if (!this.isLive()) return;
    this.pauseReasons.add("manual");
    this.syncPause();
  }

  resume(): void {
    if (!this.pauseReasons.delete("manual")) return;
    this.syncPause();
  }

  /**
   * Cycle to the next video input. Resolves `true` if the camera changed.
   * The old track is released first (mobile browsers often can't open two
   * cameras at once); on failure the previous camera is re-opened.
   */
  async switchCamera(): Promise<boolean> {
    const { state, switching } = this.snapshot;
    if (switching || (state !== "active" && state !== "paused")) return false;
    const token = this.token;
    await this.refreshDevices();
    if (
      token !== this.token ||
      this.videoDeviceIds.length < 2 ||
      !this.stream
    ) {
      return false;
    }

    const currentId = this.stream.getVideoTracks()[0]?.getSettings().deviceId;
    const index = currentId ? this.videoDeviceIds.indexOf(currentId) : -1;
    const nextId =
      this.videoDeviceIds[(index + 1) % this.videoDeviceIds.length];
    if (!nextId || nextId === currentId) return false;

    this.set({ switching: true });
    this.releaseStream();
    let next: MediaStream;
    try {
      next = await this.acquire(nextId);
    } catch {
      if (token !== this.token) return false;
      // Try to get the previous camera back so the session isn't lost.
      try {
        const previous = await this.acquire(currentId);
        if (token !== this.token) {
          stopTracks(previous);
          return false;
        }
        this.adopt(previous);
        this.set({ switching: false, facing: this.currentFacing() });
      } catch (error) {
        if (token === this.token) this.fail(classifyCameraError(error));
      }
      return false;
    }
    if (token !== this.token) {
      stopTracks(next);
      return false;
    }
    this.adopt(next);
    this.set({ switching: false, facing: this.currentFacing() });
    return true;
  }

  // --- internals ------------------------------------------------------------

  private mediaDevices(): MediaDevicesLike | undefined {
    if ("mediaDevices" in this.deps) return this.deps.mediaDevices;
    return typeof navigator === "undefined"
      ? undefined
      : navigator.mediaDevices;
  }

  private isLive(): boolean {
    const { state } = this.snapshot;
    return state === "requesting_permission" || holdsStream(state);
  }

  private set(patch: Partial<CameraSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private apply(event: CameraEvent, patch: Partial<CameraSnapshot>): void {
    const next = transitionCamera(this.snapshot.state, event);
    if (next === null) return;
    this.set({ ...patch, state: next });
  }

  private fail(error: CameraError): void {
    this.releaseAll();
    this.apply(
      { type: "FAILED" },
      { error, switching: false, canSwitch: false },
    );
  }

  private async acquire(deviceId?: string): Promise<MediaStream> {
    const mediaDevices = this.mediaDevices();
    if (!mediaDevices)
      throw new DOMException("No media devices", "NotFoundError");
    const size = {
      width: { ideal: CAMERA_IDEAL_RESOLUTION.width },
      height: { ideal: CAMERA_IDEAL_RESOLUTION.height },
    };
    try {
      return await mediaDevices.getUserMedia({
        audio: false,
        video: deviceId
          ? { ...size, deviceId: { exact: deviceId } }
          : { ...size, facingMode: { ideal: "environment" } },
      });
    } catch (error) {
      // Some devices reject the preferred constraints outright; ask for any.
      if (!deviceId && errorName(error) === "OverconstrainedError") {
        return mediaDevices.getUserMedia({ audio: false, video: true });
      }
      throw error;
    }
  }

  private adopt(stream: MediaStream): void {
    this.stream = stream;
    for (const track of stream.getVideoTracks()) {
      track.addEventListener("ended", this.onTrackEnded);
    }
    this.syncTracks();
    this.bindVideo();
  }

  /** Stop and detach the stream (and video) without changing state. */
  private releaseStream(): void {
    const stream = this.stream;
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    if (!stream) return;
    for (const track of stream.getTracks()) {
      track.removeEventListener("ended", this.onTrackEnded);
    }
    stopTracks(stream);
  }

  private releaseAll(): void {
    this.releaseStream();
    this.unwatchVisibility?.();
    this.unwatchVisibility = null;
  }

  private onTrackEnded = (): void => {
    if (!this.stream) return;
    this.token++;
    this.fail(DEVICE_LOST_ERROR);
  };

  private bindVideo(): void {
    const video = this.video;
    if (!video || !this.stream) return;
    video.srcObject = this.stream;
    video.muted = true;
    // Autoplay can be refused; the stream is still attached, so ignore it.
    void Promise.resolve(video.play?.()).catch(() => {});
  }

  /** Reflect `pauseReasons` onto tracks, the video, and the state machine. */
  private syncPause(): void {
    const paused = this.pauseReasons.size > 0;
    this.syncTracks();
    if (this.video && this.stream) {
      if (paused) this.video.pause?.();
      else void Promise.resolve(this.video.play?.()).catch(() => {});
    }
    this.apply({ type: paused ? "PAUSE" : "RESUME" }, {});
  }

  private syncTracks(): void {
    const enabled = this.pauseReasons.size === 0;
    this.stream?.getVideoTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  private watchVisibility(): void {
    if (this.unwatchVisibility) return;
    const visibility = this.deps.visibility ?? documentVisibility();
    const onChange = () => {
      if (visibility.isHidden()) this.pauseReasons.add("hidden");
      else this.pauseReasons.delete("hidden");
      this.syncPause();
    };
    this.unwatchVisibility = visibility.subscribe(onChange);
    if (visibility.isHidden()) this.pauseReasons.add("hidden");
  }

  private async refreshDevices(): Promise<void> {
    try {
      const devices = await this.mediaDevices()?.enumerateDevices();
      this.videoDeviceIds = (devices ?? [])
        .filter((device) => device.kind === "videoinput" && device.deviceId)
        .map((device) => device.deviceId);
    } catch {
      this.videoDeviceIds = [];
    }
  }

  private canSwitch(): boolean {
    return this.videoDeviceIds.length > 1;
  }

  private currentFacing(): CameraFacing {
    const facing = this.stream?.getVideoTracks()[0]?.getSettings().facingMode;
    return facing === "environment" || facing === "user" ? facing : "unknown";
  }
}

function stopTracks(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}
