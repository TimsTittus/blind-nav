import type { HeadingSource, HeadingState } from "@/core";

export interface GpsHeading {
  degrees: number;
  timestamp: number;
}

export interface DeviceOrientationHeading {
  degrees: number;
  accuracyDegrees?: number;
  timestamp: number;
}

export function resolveHeading(
  gps: GpsHeading | null,
  deviceOrientation: DeviceOrientationHeading | null,
): HeadingState | null {
  if (deviceOrientation !== null && gps !== null) {
    if (deviceOrientation.timestamp >= gps.timestamp) {
      return fromDevice(deviceOrientation);
    }
    return fromGps(gps);
  }

  if (deviceOrientation !== null) return fromDevice(deviceOrientation);
  if (gps !== null) return fromGps(gps);
  return null;
}

function fromGps(h: GpsHeading): HeadingState {
  return {
    degrees: h.degrees,
    source: "gps" satisfies HeadingSource,
    timestamp: h.timestamp,
  };
}

function fromDevice(h: DeviceOrientationHeading): HeadingState {
  return {
    degrees: h.degrees,
    source: "device_orientation" satisfies HeadingSource,
    accuracyDegrees: h.accuracyDegrees,
    timestamp: h.timestamp,
  };
}
