import type { LatLng, LocationState, Route, RouteStep } from "@/core";
import { LOCATION_CONFIG } from "./config";
import { distanceToSegment, haversineDistance } from "./geo-math";

export type RouteStatus = "navigating" | "off_route" | "arrived" | "idle";

export interface RouteTrackerState {
  readonly status: RouteStatus;
  readonly currentStepIndex: number;
  readonly distanceToStepMeters: number;
  readonly totalProgressFraction: number;
  readonly currentStep: RouteStep | null;
  readonly nextStep: RouteStep | null;
}

export const IDLE_TRACKER_STATE: RouteTrackerState = {
  status: "idle",
  currentStepIndex: 0,
  distanceToStepMeters: 0,
  totalProgressFraction: 0,
  currentStep: null,
  nextStep: null,
};

export interface RouteTrackerOptions {
  offRouteThresholdMeters?: number;
  offRouteDebounceMs?: number;
  arrivalThresholdMeters?: number;
  stepAdvanceMeters?: number;
  now?: () => number;
}

export class RouteTracker {
  private route: Route | null = null;
  private _state: RouteTrackerState = IDLE_TRACKER_STATE;
  private offRouteStartedAt: number | null = null;

  private readonly offRouteThreshold: number;
  private readonly offRouteDebounceMs: number;
  private readonly arrivalThreshold: number;
  private readonly stepAdvanceThreshold: number;
  private readonly now: () => number;

  constructor(options: RouteTrackerOptions = {}) {
    this.offRouteThreshold =
      options.offRouteThresholdMeters ??
      LOCATION_CONFIG.offRouteThresholdMeters;
    this.offRouteDebounceMs =
      options.offRouteDebounceMs ?? LOCATION_CONFIG.offRouteDebounceMs;
    this.arrivalThreshold =
      options.arrivalThresholdMeters ?? LOCATION_CONFIG.arrivalThresholdMeters;
    this.stepAdvanceThreshold =
      options.stepAdvanceMeters ?? LOCATION_CONFIG.stepAdvanceMeters;
    this.now = options.now ?? (() => Date.now());
  }

  get state(): RouteTrackerState {
    return this._state;
  }

  setRoute(route: Route): void {
    this.route = route;
    this.offRouteStartedAt = null;
    const step = route.steps[0] ?? null;
    this._state = {
      status: "navigating",
      currentStepIndex: 0,
      distanceToStepMeters: 0,
      totalProgressFraction: 0,
      currentStep: step,
      nextStep: route.steps[1] ?? null,
    };
  }

  clearRoute(): void {
    this.route = null;
    this.offRouteStartedAt = null;
    this._state = IDLE_TRACKER_STATE;
  }

  update(location: LocationState): RouteTrackerState {
    if (!this.route || this._state.status === "arrived") {
      return this._state;
    }

    const steps = this.route.steps;
    const pos = location.coords;

    if (this.checkArrival(pos, steps)) {
      this.offRouteStartedAt = null;
      this._state = {
        status: "arrived",
        currentStepIndex: steps.length - 1,
        distanceToStepMeters: 0,
        totalProgressFraction: 1,
        currentStep: steps[steps.length - 1] ?? null,
        nextStep: null,
      };
      return this._state;
    }

    const newIndex = this.advanceStep(pos, steps, this._state.currentStepIndex);
    const currentStep = steps[newIndex] ?? null;
    const nextStep = steps[newIndex + 1] ?? null;

    const distanceToStep = currentStep?.endsAt
      ? haversineDistance(pos, currentStep.endsAt)
      : 0;

    const progress = this.computeProgress(newIndex, steps);
    const offRoute = this.checkOffRoute(pos, steps, newIndex);

    this._state = {
      status: offRoute ? "off_route" : "navigating",
      currentStepIndex: newIndex,
      distanceToStepMeters: distanceToStep,
      totalProgressFraction: progress,
      currentStep,
      nextStep,
    };

    return this._state;
  }

  private checkArrival(pos: LatLng, steps: readonly RouteStep[]): boolean {
    const lastStep = steps[steps.length - 1];
    if (!lastStep) return false;
    const dest = lastStep.startsAt ?? lastStep.endsAt;
    if (!dest) return false;
    return haversineDistance(pos, dest) <= this.arrivalThreshold;
  }

  private advanceStep(
    pos: LatLng,
    steps: readonly RouteStep[],
    currentIndex: number,
  ): number {
    let index = currentIndex;

    while (index < steps.length - 1) {
      const step = steps[index];
      if (!step?.endsAt) break;

      const distToEnd = haversineDistance(pos, step.endsAt);
      if (distToEnd > this.stepAdvanceThreshold) break;
      index++;
    }

    return index;
  }

  private computeProgress(
    currentIndex: number,
    steps: readonly RouteStep[],
  ): number {
    if (steps.length <= 1) return 0;
    return currentIndex / (steps.length - 1);
  }

  private checkOffRoute(
    pos: LatLng,
    steps: readonly RouteStep[],
    currentIndex: number,
  ): boolean {
    const step = steps[currentIndex];
    if (!step) return false;

    const segStart = step.startsAt;
    const segEnd = step.endsAt;
    let dist: number;

    if (segStart && segEnd) {
      dist = distanceToSegment(pos, segStart, segEnd);
    } else if (segStart) {
      dist = haversineDistance(pos, segStart);
    } else if (segEnd) {
      dist = haversineDistance(pos, segEnd);
    } else {
      return false;
    }

    if (dist <= this.offRouteThreshold) {
      this.offRouteStartedAt = null;
      return false;
    }

    const now = this.now();
    if (this.offRouteStartedAt === null) {
      this.offRouteStartedAt = now;
      return false;
    }

    return now - this.offRouteStartedAt >= this.offRouteDebounceMs;
  }
}
