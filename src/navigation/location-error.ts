export type LocationErrorKind =
  | "unsupported"
  | "permission_denied"
  | "position_unavailable"
  | "timeout"
  | "unknown";

export interface LocationError {
  kind: LocationErrorKind;
  message: string;
  retryable: boolean;
}

export const UNSUPPORTED_ERROR: LocationError = {
  kind: "unsupported",
  message: "Geolocation is not supported in this browser.",
  retryable: false,
};

export function classifyGeolocationError(
  error: GeolocationPositionError,
): LocationError {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return {
        kind: "permission_denied",
        message:
          "Location permission was denied. Allow location access in your browser settings.",
        retryable: true,
      };
    case error.POSITION_UNAVAILABLE:
      return {
        kind: "position_unavailable",
        message: "Location information is unavailable.",
        retryable: true,
      };
    case error.TIMEOUT:
      return {
        kind: "timeout",
        message: "Location request timed out.",
        retryable: true,
      };
    default:
      return {
        kind: "unknown",
        message: "An unknown location error occurred.",
        retryable: true,
      };
  }
}
