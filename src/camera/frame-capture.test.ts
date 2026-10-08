import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FrameCapture,
  FrameCaptureError,
  detectWebPSupport,
  fitWithin,
  resetWebPDetection,
  type FrameCaptureCallOptions,
} from "./frame-capture";

function setup(
  video = { videoWidth: 1920, videoHeight: 1080, readyState: 4 },
  encode: (type?: string, quality?: number) => Blob | null = () =>
    new Blob(["x".repeat(10)], { type: "image/jpeg" }),
) {
  const drawImage = vi.fn();
  const toBlob = vi.fn(
    (cb: (b: Blob | null) => void, type?: string, quality?: number) =>
      cb(encode(type, quality)),
  );
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage }),
    toBlob,
  };
  const createCanvas = vi.fn(() => canvas);
  let source: typeof video | null = video;
  const capture = new FrameCapture(() => source, { createCanvas });
  return {
    capture,
    canvas,
    drawImage,
    toBlob,
    createCanvas,
    setSource: (next: typeof video | null) => (source = next),
  };
}

describe("detectWebPSupport", () => {
  afterEach(() => resetWebPDetection());

  it("returns true when canvas encodes image/webp", () => {
    const createCanvas = () => ({
      width: 0,
      height: 0,
      getContext: () => null,
      toBlob: (cb: (b: Blob | null) => void, type?: string) =>
        cb(new Blob([], { type: type ?? "" })),
    });
    expect(detectWebPSupport(createCanvas)).toBe(true);
  });

  it("returns false when canvas cannot encode webp", () => {
    const createCanvas = () => ({
      width: 0,
      height: 0,
      getContext: () => null,
      toBlob: (cb: (b: Blob | null) => void) =>
        cb(new Blob([], { type: "image/png" })),
    });
    expect(detectWebPSupport(createCanvas)).toBe(false);
  });

  it("caches the result", () => {
    const createCanvas = vi.fn(() => ({
      width: 0,
      height: 0,
      getContext: () => null,
      toBlob: (cb: (b: Blob | null) => void, type?: string) =>
        cb(new Blob([], { type: type ?? "" })),
    }));
    detectWebPSupport(createCanvas);
    detectWebPSupport(createCanvas);
    expect(createCanvas).toHaveBeenCalledTimes(1);
  });
});

describe("fitWithin", () => {
  it("scales down preserving aspect ratio", () => {
    expect(fitWithin(1920, 1080, 1024, 1024)).toEqual({
      width: 1024,
      height: 576,
    });
    expect(fitWithin(1080, 1920, 1024, 1024)).toEqual({
      width: 576,
      height: 1024,
    });
  });
  it("never upscales", () => {
    expect(fitWithin(320, 240, 1024, 1024)).toEqual({
      width: 320,
      height: 240,
    });
  });
  it("respects the tighter of the two bounds", () => {
    expect(fitWithin(1000, 1000, 500, 250)).toEqual({
      width: 250,
      height: 250,
    });
  });
});

describe("FrameCapture.captureFrame", () => {
  afterEach(() => resetWebPDetection());

  it("returns a binary Blob using defaults (JPEG, ≤1024)", async () => {
    const { capture, toBlob, canvas } = setup();
    const frame = await capture.captureFrame();

    expect(frame.blob).toBeInstanceOf(Blob);
    expect(frame).toMatchObject({
      width: 1024,
      height: 576,
      mimeType: "image/jpeg",
      sequence: 1,
    });
    expect(canvas).toMatchObject({ width: 1024, height: 576 });
    expect(toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/jpeg",
      0.7,
    );
  });

  it("honours maxWidth, maxHeight and quality overrides", async () => {
    const { capture, toBlob } = setup();
    const frame = await capture.captureFrame({
      maxWidth: 640,
      maxHeight: 640,
      quality: 0.4,
    });
    expect(frame).toMatchObject({ width: 640, height: 360 });
    expect(toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/jpeg",
      0.4,
    );
  });

  it("increments the sequence and reuses the capture canvas", async () => {
    const { capture, createCanvas } = setup();
    const a = await capture.captureFrame();
    const callsAfterFirst = createCanvas.mock.calls.length;
    const b = await capture.captureFrame();
    expect([a.sequence, b.sequence]).toEqual([1, 2]);
    expect(createCanvas).toHaveBeenCalledTimes(callsAfterFirst);
  });

  it("rejects invalid options", async () => {
    const { capture } = setup();
    for (const bad of [
      { quality: 2 },
      { maxWidth: 0 },
      { maxHeight: 1e6 },
    ] as FrameCaptureCallOptions[]) {
      await expect(capture.captureFrame(bad)).rejects.toThrow();
    }
  });

  it("fails clearly with no source or an unready video", async () => {
    const { capture, setSource } = setup();
    setSource(null);
    await expect(capture.captureFrame()).rejects.toMatchObject({
      kind: "source_unavailable",
    });
    setSource({ videoWidth: 0, videoHeight: 0, readyState: 0 });
    await expect(capture.captureFrame()).rejects.toMatchObject({
      kind: "not_ready",
    });
  });

  it("fails when encoding yields no blob", async () => {
    const { capture } = setup(undefined, () => null);
    await expect(capture.captureFrame()).rejects.toMatchObject({
      kind: "encode_failed",
    });
  });

  it("honours an already-aborted signal without touching the canvas", async () => {
    const { capture, drawImage } = setup();
    const controller = new AbortController();
    controller.abort();
    const error = await capture
      .captureFrame({ signal: controller.signal })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FrameCaptureError);
    expect(error).toMatchObject({ kind: "aborted" });
    expect(drawImage).not.toHaveBeenCalled();
  });

  it("discards the result if aborted while encoding", async () => {
    const controller = new AbortController();
    const { capture } = setup(undefined, (type) => {
      controller.abort();
      return new Blob(["x"], type ? { type } : {});
    });
    await expect(
      capture.captureFrame({ signal: controller.signal }),
    ).rejects.toMatchObject({ kind: "aborted" });
  });

  it("prefers WebP when browser supports it", async () => {
    resetWebPDetection();
    const webpEncode = (type?: string) =>
      new Blob(["x"], { type: type ?? "image/webp" });
    const { capture, toBlob } = setup(undefined, webpEncode);
    const frame = await capture.captureFrame();
    expect(frame.mimeType).toBe("image/webp");
    expect(toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/webp",
      0.7,
    );
  });

  it("respects explicit mimeType override even when WebP is available", async () => {
    resetWebPDetection();
    const webpEncode = (type?: string) =>
      new Blob(["x"], { type: type ?? "image/webp" });
    const { capture, toBlob } = setup(undefined, webpEncode);
    await capture.captureFrame({ mimeType: "image/jpeg" });
    expect(toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/jpeg",
      0.7,
    );
  });
});
