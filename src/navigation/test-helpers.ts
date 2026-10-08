import type { LatLng, LocationState, Route, RouteStep } from "@/core";

export interface FakeGeolocationOptions {
  onWatch?: (
    success: (pos: GeolocationPosition) => void,
    error: (err: GeolocationPositionError) => void,
  ) => void;
}

export function fakeGeolocation(options: FakeGeolocationOptions = {}) {
  let watchId = 0;
  let successCb: ((pos: GeolocationPosition) => void) | null = null;
  let errorCb: ((err: GeolocationPositionError) => void) | null = null;

  const geo = {
    watchPosition(
      success: PositionCallback,
      error?: PositionErrorCallback | null,
      _options?: PositionOptions,
    ): number {
      successCb = success;
      errorCb = error ?? null;
      watchId++;
      options.onWatch?.(success, error ?? (() => {}));
      return watchId;
    },
    clearWatch(_id: number): void {
      successCb = null;
      errorCb = null;
    },
  };

  return {
    geo,
    sendPosition(
      lat: number,
      lng: number,
      extras?: {
        accuracy?: number;
        heading?: number | null;
        speed?: number | null;
        timestamp?: number;
      },
    ): void {
      successCb?.(fakePosition(lat, lng, extras));
    },
    sendError(code: number, message?: string): void {
      errorCb?.(fakePositionError(code, message));
    },
  };
}

export function fakePosition(
  lat: number,
  lng: number,
  extras?: {
    accuracy?: number;
    heading?: number | null;
    speed?: number | null;
    timestamp?: number;
  },
): GeolocationPosition {
  const coords = {
    latitude: lat,
    longitude: lng,
    accuracy: extras?.accuracy ?? 10,
    altitude: null,
    altitudeAccuracy: null,
    heading: extras?.heading ?? null,
    speed: extras?.speed ?? null,
    toJSON() {
      return { ...this, toJSON: undefined };
    },
  };
  return {
    coords,
    timestamp: extras?.timestamp ?? Date.now(),
    toJSON() {
      return { coords, timestamp: this.timestamp };
    },
  };
}

export function fakePositionError(
  code: number,
  message?: string,
): GeolocationPositionError {
  return {
    code,
    message: message ?? "Mock error",
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  };
}

export function fakeLocation(
  lat: number,
  lng: number,
  extras?: { accuracy?: number; timestamp?: number },
): LocationState {
  return {
    coords: { lat, lng },
    accuracyMeters: extras?.accuracy ?? 10,
    timestamp: extras?.timestamp ?? Date.now(),
  };
}

export function fakeRoute(
  origin: LatLng,
  destination: LatLng,
  waypoints?: LatLng[],
): Route {
  const points = [origin, ...(waypoints ?? []), destination];
  const steps: RouteStep[] = points.map((coord, i) => ({
    id: `s${String(i)}`,
    index: i,
    instruction:
      i === 0
        ? "Start walking."
        : i === points.length - 1
          ? "You have arrived."
          : `Continue to waypoint ${String(i)}.`,
    distanceMeters: i < points.length - 1 ? 100 : 0,
    maneuver:
      i === 0 ? "depart" : i === points.length - 1 ? "arrive" : "straight",
    startsAt: coord,
    endsAt: i < points.length - 1 ? points[i + 1] : undefined,
  }));

  return {
    id: "00000000-0000-4000-8000-000000000001",
    destination: { id: "d1", label: "Test destination", coords: destination },
    origin,
    steps,
    totalDistanceMeters: (points.length - 1) * 100,
    totalDurationSeconds: (points.length - 1) * 71,
    createdAt: Date.now(),
  };
}
