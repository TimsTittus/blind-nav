import type { HeadingState, LocationState } from "@/core";
import { LOCATION_CONFIG } from "./config";
import { resolveHeading, type GpsHeading } from "./heading";
import {
  classifyGeolocationError,
  UNSUPPORTED_ERROR,
  type LocationError,
} from "./location-error";
import {
  transitionLocation,
  type LocationControllerState,
  type LocationEvent,
} from "./state";

export interface LocationSnapshot {
  state: LocationControllerState;
  location: LocationState | null;
  heading: HeadingState | null;
  error: LocationError | null;
}

export const INITIAL_LOCATION_SNAPSHOT: LocationSnapshot = {
  state: "permission_required",
  location: null,
  heading: null,
  error: null,
};

type GeolocationLike = Pick<Geolocation, "watchPosition" | "clearWatch">;

export interface LocationControllerDeps {
  geolocation?: GeolocationLike | null;
  now?: () => number;
}

export class LocationController {
  private readonly deps: LocationControllerDeps;
  private snapshot: LocationSnapshot = INITIAL_LOCATION_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private watchId: number | null = null;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: LocationControllerDeps = {}) {
    this.deps = deps;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): LocationSnapshot => this.snapshot;

  start(): void {
    const { state } = this.snapshot;
    if (state === "acquiring" || state === "active") return;

    const geo = this.geolocation();
    if (!geo) {
      this.apply({ type: "UNSUPPORTED" }, { error: UNSUPPORTED_ERROR });
      return;
    }

    this.apply({ type: "REQUEST" }, { error: null });

    this.watchId = geo.watchPosition(
      (position) => this.onPosition(position),
      (error) => this.onError(error),
      {
        enableHighAccuracy: LOCATION_CONFIG.highAccuracy,
        maximumAge: LOCATION_CONFIG.maxAgeMs,
        timeout: LOCATION_CONFIG.timeoutMs,
      },
    );
  }

  stop(): void {
    this.clearWatch();
    this.clearStaleTimer();
    this.apply(
      { type: "STOP" },
      { location: null, heading: null, error: null },
    );
  }

  private onPosition(position: GeolocationPosition): void {
    const coords = position.coords;
    const timestamp = position.timestamp;

    const location: LocationState = {
      coords: { lat: coords.latitude, lng: coords.longitude },
      accuracyMeters: coords.accuracy,
      altitudeMeters: coords.altitude ?? undefined,
      speedMps:
        coords.speed !== null && coords.speed >= 0 ? coords.speed : undefined,
      heading:
        coords.heading !== null && coords.heading >= 0
          ? coords.heading
          : undefined,
      timestamp,
    };

    const gpsHeading: GpsHeading | null =
      coords.heading !== null && coords.heading >= 0
        ? { degrees: coords.heading, timestamp }
        : null;

    const heading = resolveHeading(gpsHeading, null);

    this.apply({ type: "ACQUIRED" }, { location, heading, error: null });

    this.resetStaleTimer();
  }

  private onError(error: GeolocationPositionError): void {
    const classified = classifyGeolocationError(error);

    if (classified.kind === "permission_denied") {
      this.clearWatch();
      this.clearStaleTimer();
      this.apply({ type: "DENIED" }, { error: classified });
      return;
    }

    this.apply({ type: "FAILED" }, { error: classified });
  }

  private resetStaleTimer(): void {
    this.clearStaleTimer();
    this.staleTimer = setTimeout(() => {
      if (this.snapshot.state === "active") {
        this.apply({ type: "STALE" }, {});
      }
    }, LOCATION_CONFIG.staleThresholdMs);
  }

  private clearStaleTimer(): void {
    if (this.staleTimer !== null) {
      clearTimeout(this.staleTimer);
      this.staleTimer = null;
    }
  }

  private clearWatch(): void {
    if (this.watchId !== null) {
      this.geolocation()?.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  private geolocation(): GeolocationLike | null {
    if ("geolocation" in this.deps) return this.deps.geolocation ?? null;
    return typeof navigator !== "undefined" && navigator.geolocation
      ? navigator.geolocation
      : null;
  }

  private set(patch: Partial<LocationSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private apply(event: LocationEvent, patch: Partial<LocationSnapshot>): void {
    const next = transitionLocation(this.snapshot.state, event);
    if (next === null) return;
    this.set({ ...patch, state: next });
  }
}
