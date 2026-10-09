import { describe, expect, it } from "vitest";
import {
  CameraFrameOrientationSchema,
  CameraFrameSchema,
  CameraFrameSourceKindSchema,
  INITIAL_SOURCE_SNAPSHOT,
  type CameraFrame,
} from "./source";

describe("CameraFrame schema", () => {
  const validFrame: CameraFrame = {
    id: 1,
    timestamp: Date.now(),
    width: 1280,
    height: 720,
    orientation: "landscape",
    source: "browser",
    data: new Blob(["pixels"], { type: "image/jpeg" }),
  };

  it("accepts a valid frame", () => {
    expect(CameraFrameSchema.parse(validFrame)).toEqual(validFrame);
  });

  it("rejects negative id", () => {
    expect(() => CameraFrameSchema.parse({ ...validFrame, id: -1 })).toThrow();
  });

  it("rejects zero width", () => {
    expect(() =>
      CameraFrameSchema.parse({ ...validFrame, width: 0 }),
    ).toThrow();
  });

  it("rejects non-Blob data", () => {
    expect(() =>
      CameraFrameSchema.parse({ ...validFrame, data: "not a blob" }),
    ).toThrow();
  });

  it("rejects unknown orientation value", () => {
    expect(() => CameraFrameOrientationSchema.parse("upside_down")).toThrow();
  });

  it("accepts all source kinds", () => {
    for (const kind of [
      "browser",
      "mobile",
      "external",
      "fixture",
      "unknown",
    ]) {
      expect(CameraFrameSourceKindSchema.parse(kind)).toBe(kind);
    }
  });
});

describe("CameraFrameOrientation", () => {
  it("accepts landscape, portrait, and unknown", () => {
    expect(CameraFrameOrientationSchema.parse("landscape")).toBe("landscape");
    expect(CameraFrameOrientationSchema.parse("portrait")).toBe("portrait");
    expect(CameraFrameOrientationSchema.parse("unknown")).toBe("unknown");
  });
});

describe("INITIAL_SOURCE_SNAPSHOT", () => {
  it("starts idle with no error", () => {
    expect(INITIAL_SOURCE_SNAPSHOT).toEqual({
      state: "idle",
      error: null,
    });
  });
});
