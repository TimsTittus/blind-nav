export type CameraErrorKind =
  | "unsupported"
  | "permission_denied"
  | "blocked"
  | "no_camera"
  | "camera_in_use"
  | "device_lost"
  | "unknown";

/** Plain, serialisable, user-presentable camera failure. */
export interface CameraError {
  kind: CameraErrorKind;
  message: string;
  retryable: boolean;
}

export const UNSUPPORTED_ERROR: CameraError = {
  kind: "unsupported",
  message:
    "This browser cannot access a camera here. Use a current browser over HTTPS.",
  retryable: false,
};

export const DEVICE_LOST_ERROR: CameraError = {
  kind: "device_lost",
  message: "The camera was disconnected or stopped unexpectedly.",
  retryable: true,
};

export function errorName(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error) {
    const { name } = error as { name: unknown };
    if (typeof name === "string") return name;
  }
  return "";
}

/** Maps a `getUserMedia` rejection (untrusted) to a stable CameraError. */
export function classifyCameraError(error: unknown): CameraError {
  switch (errorName(error)) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return {
        kind: "permission_denied",
        message:
          "Camera permission was denied. Allow camera access in the browser's site settings, then try again.",
        retryable: true,
      };
    case "SecurityError":
      return {
        kind: "blocked",
        message:
          "Camera access is blocked by the browser or page policy. HTTPS is required.",
        retryable: false,
      };
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return {
        kind: "no_camera",
        message: "No camera was found on this device.",
        retryable: true,
      };
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return {
        kind: "camera_in_use",
        message:
          "The camera could not be started. Another app may be using it.",
        retryable: true,
      };
    default:
      return {
        kind: "unknown",
        message: "The camera could not be started.",
        retryable: true,
      };
  }
}
