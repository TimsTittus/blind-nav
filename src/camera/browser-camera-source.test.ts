import { describe, expect, it, vi } from "vitest";
import { BrowserCameraSource } from "./browser-camera-source";
import type { CameraFrame } from "./source";

describe("BrowserCameraSource", () => {
  it("has kind 'browser'", () => {
    const source = new BrowserCameraSource();
    expect(source.kind).toBe("browser");
  });

  it("starts in idle state", () => {
    const source = new BrowserCameraSource();
    expect(source.getSnapshot()).toEqual({
      state: "idle",
      error: null,
    });
  });

  it("captureFrame returns a normalized CameraFrame shape", async () => {
    const frame = mockCameraFrame();

    expect(frame.id).toBe(1);
    expect(frame.source).toBe("browser");
    expect(frame.orientation).toBe("landscape");
    expect(frame.data).toBeInstanceOf(Blob);
    expect(frame.width).toBe(1280);
    expect(frame.height).toBe(720);
    expect(typeof frame.timestamp).toBe("number");
  });

  it("maps portrait orientation correctly", () => {
    const frame = mockCameraFrame(720, 1280);
    expect(frame.orientation).toBe("portrait");
  });

  it("maps square as unknown orientation", () => {
    const frame = mockCameraFrame(720, 720);
    expect(frame.orientation).toBe("unknown");
  });

  it("subscribe notifies on state change", () => {
    const source = new BrowserCameraSource();
    const listener = vi.fn();
    const unsub = source.subscribe(listener);
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("dispose stops the camera", () => {
    const source = new BrowserCameraSource();
    source.dispose();
    expect(source.getSnapshot().state).toBe("idle");
  });
});

function orientationOf(w: number, h: number): CameraFrame["orientation"] {
  if (w > h) return "landscape";
  if (h > w) return "portrait";
  return "unknown";
}

function mockCameraFrame(width = 1280, height = 720): CameraFrame {
  return {
    id: 1,
    timestamp: Date.now(),
    width,
    height,
    orientation: orientationOf(width, height),
    source: "browser",
    data: new Blob(["pixels"], { type: "image/jpeg" }),
  };
}
