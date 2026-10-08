import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocationController } from "./location-controller";
import { fakeGeolocation } from "./test-helpers";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LocationController", () => {
  it("starts in permission_required", () => {
    const controller = new LocationController({ geolocation: null });
    expect(controller.getSnapshot().state).toBe("permission_required");
  });

  it("transitions to unsupported when no geolocation", () => {
    const controller = new LocationController({ geolocation: null });
    controller.start();
    expect(controller.getSnapshot().state).toBe("unsupported");
    expect(controller.getSnapshot().error?.kind).toBe("unsupported");
  });

  it("transitions to acquiring on start", () => {
    const { geo } = fakeGeolocation();
    const controller = new LocationController({ geolocation: geo });
    controller.start();
    expect(controller.getSnapshot().state).toBe("acquiring");
  });

  it("transitions to active on position received", () => {
    const { geo, sendPosition } = fakeGeolocation();
    const controller = new LocationController({ geolocation: geo });
    controller.start();
    sendPosition(40.7128, -74.006);
    const snap = controller.getSnapshot();
    expect(snap.state).toBe("active");
    expect(snap.location?.coords.lat).toBeCloseTo(40.7128);
    expect(snap.location?.coords.lng).toBeCloseTo(-74.006);
  });

  it("extracts accuracy from position", () => {
    const { geo, sendPosition } = fakeGeolocation();
    const controller = new LocationController({ geolocation: geo });
    controller.start();
    sendPosition(40.7128, -74.006, { accuracy: 25 });
    expect(controller.getSnapshot().location?.accuracyMeters).toBe(25);
  });

  it("extracts GPS heading when available", () => {
    const { geo, sendPosition } = fakeGeolocation();
    const controller = new LocationController({ geolocation: geo });
    controller.start();
    sendPosition(40.7128, -74.006, { heading: 90 });
    const snap = controller.getSnapshot();
    expect(snap.heading?.degrees).toBe(90);
    expect(snap.heading?.source).toBe("gps");
  });

  it("heading is null when GPS heading not available", () => {
    const { geo, sendPosition } = fakeGeolocation();
    const controller = new LocationController({ geolocation: geo });
    controller.start();
    sendPosition(40.7128, -74.006, { heading: null });
    expect(controller.getSnapshot().heading).toBeNull();
  });

  it("transitions to permission_denied on denial", () => {
    const { geo, sendError } = fakeGeolocation();
    const controller = new LocationController({ geolocation: geo });
    controller.start();
    sendError(1); // PERMISSION_DENIED
    const snap = controller.getSnapshot();
    expect(snap.state).toBe("permission_denied");
    expect(snap.error?.kind).toBe("permission_denied");
  });

  it("transitions to error on position unavailable", () => {
    const { geo, sendError } = fakeGeolocation();
    const controller = new LocationController({ geolocation: geo });
    controller.start();
    sendError(2); // POSITION_UNAVAILABLE
    expect(controller.getSnapshot().state).toBe("error");
  });

  it("transitions to error on timeout", () => {
    const { geo, sendError } = fakeGeolocation();
    const controller = new LocationController({ geolocation: geo });
    controller.start();
    sendError(3); // TIMEOUT
    expect(controller.getSnapshot().state).toBe("error");
    expect(controller.getSnapshot().error?.kind).toBe("timeout");
  });

  it("transitions to stale after threshold", () => {
    const { geo, sendPosition } = fakeGeolocation();
    const controller = new LocationController({ geolocation: geo });
    controller.start();
    sendPosition(40.7128, -74.006);
    expect(controller.getSnapshot().state).toBe("active");
    vi.advanceTimersByTime(15_001);
    expect(controller.getSnapshot().state).toBe("stale");
  });

  it("recovers from stale on new position", () => {
    const { geo, sendPosition } = fakeGeolocation();
    const controller = new LocationController({ geolocation: geo });
    controller.start();
    sendPosition(40.7128, -74.006);
    vi.advanceTimersByTime(15_001);
    expect(controller.getSnapshot().state).toBe("stale");
    sendPosition(40.7129, -74.006);
    expect(controller.getSnapshot().state).toBe("active");
  });

  it("stop returns to permission_required", () => {
    const { geo, sendPosition } = fakeGeolocation();
    const controller = new LocationController({ geolocation: geo });
    controller.start();
    sendPosition(40.7128, -74.006);
    controller.stop();
    const snap = controller.getSnapshot();
    expect(snap.state).toBe("permission_required");
    expect(snap.location).toBeNull();
    expect(snap.heading).toBeNull();
  });

  it("start is idempotent when already active", () => {
    const { geo, sendPosition } = fakeGeolocation();
    const controller = new LocationController({ geolocation: geo });
    controller.start();
    sendPosition(40.7128, -74.006);
    controller.start();
    expect(controller.getSnapshot().state).toBe("active");
  });

  it("notifies listeners on state change", () => {
    const { geo, sendPosition } = fakeGeolocation();
    const controller = new LocationController({ geolocation: geo });
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.start();
    sendPosition(40.7128, -74.006);
    expect(listener).toHaveBeenCalled();
  });

  it("unsubscribe stops notifications", () => {
    const { geo, sendPosition } = fakeGeolocation();
    const controller = new LocationController({ geolocation: geo });
    const listener = vi.fn();
    const unsub = controller.subscribe(listener);
    unsub();
    controller.start();
    sendPosition(40.7128, -74.006);
    expect(listener).not.toHaveBeenCalled();
  });
});
