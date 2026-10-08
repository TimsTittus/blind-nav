import { describe, expect, it } from "vitest";
import { RouteTracker } from "./route-tracker";
import { fakeLocation, fakeRoute } from "./test-helpers";

const ORIGIN = { lat: 40.0, lng: -74.0 };
const MID = { lat: 40.001, lng: -74.0 };
const DESTINATION = { lat: 40.002, lng: -74.0 };

function createTracker(options?: {
  offRouteThresholdMeters?: number;
  offRouteDebounceMs?: number;
  arrivalThresholdMeters?: number;
  stepAdvanceMeters?: number;
  now?: () => number;
}) {
  return new RouteTracker(options);
}

describe("RouteTracker", () => {
  describe("initial state", () => {
    it("starts idle with no route", () => {
      const tracker = createTracker();
      expect(tracker.state.status).toBe("idle");
      expect(tracker.state.currentStep).toBeNull();
    });

    it("transitions to navigating when route is set", () => {
      const tracker = createTracker();
      tracker.setRoute(fakeRoute(ORIGIN, DESTINATION, [MID]));
      expect(tracker.state.status).toBe("navigating");
      expect(tracker.state.currentStepIndex).toBe(0);
      expect(tracker.state.currentStep?.id).toBe("s0");
    });
  });

  describe("step progression", () => {
    it("advances step when close to step end", () => {
      const tracker = createTracker({ stepAdvanceMeters: 50 });
      tracker.setRoute(fakeRoute(ORIGIN, DESTINATION, [MID]));

      tracker.update(fakeLocation(ORIGIN.lat, ORIGIN.lng));
      expect(tracker.state.currentStepIndex).toBe(0);

      tracker.update(fakeLocation(MID.lat, MID.lng));
      expect(tracker.state.currentStepIndex).toBe(1);
    });

    it("does not advance when far from step end", () => {
      const tracker = createTracker({ stepAdvanceMeters: 5 });
      tracker.setRoute(fakeRoute(ORIGIN, DESTINATION, [MID]));

      tracker.update(fakeLocation(40.0005, -74.0));
      expect(tracker.state.currentStepIndex).toBe(0);
    });

    it("reports correct next step", () => {
      const tracker = createTracker({ stepAdvanceMeters: 50 });
      tracker.setRoute(fakeRoute(ORIGIN, DESTINATION, [MID]));

      tracker.update(fakeLocation(ORIGIN.lat, ORIGIN.lng));
      expect(tracker.state.nextStep?.id).toBe("s1");
    });
  });

  describe("arrival", () => {
    it("detects arrival when close to destination", () => {
      const tracker = createTracker({ arrivalThresholdMeters: 50 });
      tracker.setRoute(fakeRoute(ORIGIN, DESTINATION));

      tracker.update(fakeLocation(DESTINATION.lat, DESTINATION.lng));
      expect(tracker.state.status).toBe("arrived");
      expect(tracker.state.totalProgressFraction).toBe(1);
    });

    it("does not report arrived when far from destination", () => {
      const tracker = createTracker({ arrivalThresholdMeters: 5 });
      tracker.setRoute(fakeRoute(ORIGIN, DESTINATION));

      tracker.update(fakeLocation(ORIGIN.lat, ORIGIN.lng));
      expect(tracker.state.status).not.toBe("arrived");
    });

    it("stays arrived after arrival", () => {
      const tracker = createTracker({ arrivalThresholdMeters: 50 });
      tracker.setRoute(fakeRoute(ORIGIN, DESTINATION));

      tracker.update(fakeLocation(DESTINATION.lat, DESTINATION.lng));
      tracker.update(fakeLocation(ORIGIN.lat, ORIGIN.lng));
      expect(tracker.state.status).toBe("arrived");
    });
  });

  describe("off-route", () => {
    it("transitions to off_route after debounce", () => {
      let now = 0;
      const tracker = createTracker({
        offRouteThresholdMeters: 10,
        offRouteDebounceMs: 100,
        arrivalThresholdMeters: 5,
        now: () => now,
      });
      tracker.setRoute(fakeRoute(ORIGIN, DESTINATION));

      tracker.update(fakeLocation(40.0005, -73.999));
      expect(tracker.state.status).toBe("navigating");

      now = 200;
      tracker.update(fakeLocation(40.0005, -73.999));
      expect(tracker.state.status).toBe("off_route");
    });

    it("does not report off_route before debounce expires", () => {
      let now = 0;
      const tracker = createTracker({
        offRouteThresholdMeters: 10,
        offRouteDebounceMs: 5000,
        arrivalThresholdMeters: 5,
        now: () => now,
      });
      tracker.setRoute(fakeRoute(ORIGIN, DESTINATION));

      tracker.update(fakeLocation(40.0005, -73.999));
      now = 1000;
      tracker.update(fakeLocation(40.0005, -73.999));
      expect(tracker.state.status).toBe("navigating");
    });

    it("resets off-route timer when back on route", () => {
      let now = 0;
      const tracker = createTracker({
        offRouteThresholdMeters: 10,
        offRouteDebounceMs: 100,
        arrivalThresholdMeters: 5,
        now: () => now,
      });
      tracker.setRoute(fakeRoute(ORIGIN, DESTINATION));

      tracker.update(fakeLocation(40.0005, -73.999));

      now = 50;
      tracker.update(fakeLocation(ORIGIN.lat, ORIGIN.lng));
      expect(tracker.state.status).toBe("navigating");

      now = 200;
      tracker.update(fakeLocation(40.0005, -73.999));
      expect(tracker.state.status).toBe("navigating");
    });
  });

  describe("progress", () => {
    it("reports 0 progress at start", () => {
      const tracker = createTracker();
      tracker.setRoute(fakeRoute(ORIGIN, DESTINATION, [MID]));
      tracker.update(fakeLocation(ORIGIN.lat, ORIGIN.lng));
      expect(tracker.state.totalProgressFraction).toBe(0);
    });

    it("reports fractional progress at midpoint", () => {
      const tracker = createTracker({ stepAdvanceMeters: 50 });
      tracker.setRoute(fakeRoute(ORIGIN, DESTINATION, [MID]));
      tracker.update(fakeLocation(MID.lat, MID.lng));
      expect(tracker.state.totalProgressFraction).toBe(0.5);
    });
  });

  describe("clearRoute", () => {
    it("returns to idle", () => {
      const tracker = createTracker();
      tracker.setRoute(fakeRoute(ORIGIN, DESTINATION));
      tracker.clearRoute();
      expect(tracker.state.status).toBe("idle");
      expect(tracker.state.currentStep).toBeNull();
    });
  });

  describe("no route", () => {
    it("update is a no-op without a route", () => {
      const tracker = createTracker();
      const state = tracker.update(fakeLocation(40.0, -74.0));
      expect(state.status).toBe("idle");
    });
  });
});
