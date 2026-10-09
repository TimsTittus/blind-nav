import { describe, expect, it, vi } from "vitest";
import { requestCapabilityPermission } from "./permissions";

describe("requestCapabilityPermission", () => {
  it("requests geolocation permission when name is location", async () => {
    const getCurrentPosition = vi.fn((success) => success({ coords: {} }));
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition },
      writable: true,
      configurable: true,
    });

    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    await requestCapabilityPermission("location");

    expect(getCurrentPosition).toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(Event));
  });

  it("requests camera permission and stops track", async () => {
    const stop = vi.fn();
    const track = { stop };
    const stream = { getTracks: () => [track] };
    const getUserMedia = vi.fn(() => Promise.resolve(stream));

    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      writable: true,
      configurable: true,
    });

    await requestCapabilityPermission("camera");

    expect(getUserMedia).toHaveBeenCalledWith({ video: true });
    expect(stop).toHaveBeenCalled();
  });

  it("requests microphone permission and stops track", async () => {
    const stop = vi.fn();
    const track = { stop };
    const stream = { getTracks: () => [track] };
    const getUserMedia = vi.fn(() => Promise.resolve(stream));

    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      writable: true,
      configurable: true,
    });

    await requestCapabilityPermission("microphone");

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(stop).toHaveBeenCalled();
  });
});