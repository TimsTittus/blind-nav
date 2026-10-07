import type { ReactNode, Ref } from "react";
import type { CameraError, CameraState } from "@/camera";
import { cameraMessage } from "./camera-status";

export interface CameraViewportProps {
  state: CameraState;
  error: CameraError | null;
  videoRef: Ref<HTMLVideoElement>;
  canSwitch: boolean;
  switching: boolean;
  onStart: () => void;
  onSwitch: () => void;
  children?: ReactNode;
}

/**
 * Live camera preview plus every non-active state (off, prompt, paused,
 * error, unsupported). The preview is decorative for screen-reader users —
 * audio is the primary channel — so the `<video>` is hidden from assistive
 * tech and the state is announced through one polite live region instead (always mounted, so changes are announced).
 * The fixed aspect ratio (see `.camera-viewport` CSS) never reflows.
 */
export function CameraViewport({
  state,
  error,
  videoRef,
  canSwitch,
  switching,
  onStart,
  onSwitch,
  children,
}: CameraViewportProps) {
  const message = cameraMessage(state, error);
  const canStart =
    state === "idle" || (state === "error" && (error?.retryable ?? true));

  return (
    <section className="camera-viewport" aria-label="Camera view">
      <video
        ref={videoRef}
        className="camera-viewport__video"
        data-camera-state={state}
        hidden={state !== "active"}
        aria-hidden="true"
        autoPlay
        muted
        playsInline
      />
      <div className="camera-viewport__message">
        <p aria-live="polite" className="camera-viewport__text">
          {message}
        </p>
        {error && state === "error" ? (
          <p className="camera-viewport__hint">
            Guidance is not available without the camera.
          </p>
        ) : null}
        {canStart ? (
          <button
            type="button"
            className="control-button control-button--small"
            onClick={onStart}
          >
            {state === "error" ? "Try camera again" : "Start camera"}
          </button>
        ) : null}
      </div>
      {state === "active" && canSwitch ? (
        <button
          type="button"
          className="control-button control-button--small camera-viewport__switch"
          disabled={switching}
          onClick={onSwitch}
        >
          Switch camera
        </button>
      ) : null}
      {children}
    </section>
  );
}
