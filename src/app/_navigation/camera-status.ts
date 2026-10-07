import type { CameraError, CameraState } from "@/camera";

/** Spoken/visible text for each camera state. Pure so it is easy to test. */
export function cameraMessage(
  state: CameraState,
  error: CameraError | null,
): string {
  switch (state) {
    case "idle":
      return "Camera is off.";
    case "requesting_permission":
      return "Waiting for camera permission…";
    case "active":
      return "";
    case "paused":
      return "Camera paused.";
    case "error":
    case "unsupported":
      return error?.message ?? "The camera is unavailable.";
  }
}

/** Short label for the System status list. */
export function cameraStatusLabel(state: CameraState): string {
  switch (state) {
    case "idle":
      return "Off";
    case "requesting_permission":
      return "Requesting permission";
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    case "error":
      return "Unavailable";
    case "unsupported":
      return "Not supported";
  }
}
