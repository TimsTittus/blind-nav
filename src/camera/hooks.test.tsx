import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { domError, fakeStream } from "./test-helpers";
import type { CapturedFrame } from "./frame-capture";
import { useCamera } from "./use-camera";
import { useFrameLoop } from "./use-frame-loop";

function stubMediaDevices(getUserMedia: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia,
      enumerateDevices: vi.fn(() => Promise.resolve([])),
    },
  });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("useCamera", () => {
  it("starts, exposes state, and releases tracks on unmount", async () => {
    const { stream, track } = fakeStream();
    stubMediaDevices(vi.fn(() => Promise.resolve(stream)));
    const { result, unmount } = renderHook(() => useCamera());
    expect(result.current.state).toBe("idle");

    await act(() => result.current.start());
    expect(result.current.state).toBe("active");

    unmount();
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("surfaces permission denial as error state", async () => {
    stubMediaDevices(vi.fn(() => Promise.reject(domError("NotAllowedError"))));
    const { result } = renderHook(() => useCamera());
    await act(() => result.current.start());
    expect(result.current.state).toBe("error");
    expect(result.current.error?.kind).toBe("permission_denied");
  });

  it("reports unsupported when mediaDevices is absent", async () => {
    const { result } = renderHook(() => useCamera());
    await act(() => result.current.start());
    expect(result.current.state).toBe("unsupported");
  });

  it("releases a stream that resolves after unmount", async () => {
    const { stream, track } = fakeStream();
    let resolve!: (s: MediaStream) => void;
    stubMediaDevices(
      vi.fn(() => new Promise<MediaStream>((r) => (resolve = r))),
    );
    const { result, unmount } = renderHook(() => useCamera());
    let started!: Promise<void>;
    act(() => {
      started = result.current.start();
    });
    unmount();
    resolve(stream);
    await started;
    expect(track.stop).toHaveBeenCalled();
  });

  it("captureFrame refuses when the camera is not active", async () => {
    const { result } = renderHook(() => useCamera());
    await expect(result.current.captureFrame()).rejects.toMatchObject({
      kind: "source_unavailable",
    });
  });
});

describe("useFrameLoop", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const frame = (sequence: number) =>
    ({ sequence, blob: new Blob(["x"]) }) as unknown as CapturedFrame;

  it("feeds frames to the consumer only while enabled", async () => {
    const consume = vi.fn();
    let n = 0;
    const captureFrame = vi.fn(async () => frame(++n));
    const { rerender, unmount } = renderHook(
      ({ enabled }) =>
        useFrameLoop({
          enabled,
          captureFrame,
          consumer: { consume },
          intervalMs: 1000,
        }),
      { initialProps: { enabled: false } },
    );
    await vi.advanceTimersByTimeAsync(3000);
    expect(captureFrame).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await vi.advanceTimersByTimeAsync(2000);
    expect(consume).toHaveBeenCalledTimes(3);

    rerender({ enabled: false });
    const calls = consume.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(consume).toHaveBeenCalledTimes(calls);

    rerender({ enabled: true });
    unmount();
    await vi.advanceTimersByTimeAsync(5000);
    expect(consume.mock.calls.length).toBeLessThanOrEqual(calls + 1);
  });

  it("aborts the in-flight capture when disabled", async () => {
    let signal!: AbortSignal;
    const captureFrame = vi.fn(
      (options?: { signal?: AbortSignal }) =>
        new Promise<CapturedFrame>(() => {
          signal = options!.signal!;
        }),
    );
    const { rerender } = renderHook(
      ({ enabled }) =>
        useFrameLoop({
          enabled,
          captureFrame,
          consumer: { consume: vi.fn() },
        }),
      { initialProps: { enabled: true } },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(signal.aborted).toBe(false);
    rerender({ enabled: false });
    expect(signal.aborted).toBe(true);
  });
});
