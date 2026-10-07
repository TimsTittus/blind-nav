import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FrameScheduler } from "./frame-scheduler";
import { deferred, fakeVisibility } from "./test-helpers";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function make(
  overrides: Partial<
    ConstructorParameters<typeof FrameScheduler<number>>[0]
  > = {},
) {
  let n = 0;
  const capture = vi.fn(overrides.capture ?? (async () => ++n));
  const onFrame = vi.fn();
  const onError = vi.fn();
  const visibility = fakeVisibility();
  const scheduler = new FrameScheduler<number>({
    onFrame,
    onError,
    intervalMs: 1000,
    visibility: visibility.source,
    ...overrides,
    capture,
  });
  return { scheduler, capture, onFrame, onError, visibility };
}

describe("FrameScheduler", () => {
  it("captures immediately, then once per interval", async () => {
    const { scheduler, onFrame } = make();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onFrame).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(onFrame.mock.calls.map((c) => c[0])).toEqual([1, 2, 3, 4]);
    scheduler.stop();
  });

  it("does nothing until started and nothing after stop", async () => {
    const { scheduler, capture } = make();
    await vi.advanceTimersByTimeAsync(5000);
    expect(capture).not.toHaveBeenCalled();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.stop();
    const calls = capture.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(capture).toHaveBeenCalledTimes(calls);
    expect(scheduler.state).toBe("stopped");
  });

  it("never overlaps captures, even when capture is slower than the interval", async () => {
    let active = 0;
    let maxActive = 0;
    const { scheduler, capture } = make({
      capture: vi.fn(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 2500));
        active--;
        return 1;
      }),
    });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(12_000);
    scheduler.stop();
    expect(maxActive).toBe(1);
    expect(vi.mocked(capture).mock.calls.length).toBeGreaterThan(1);
  });

  it("waits for the in-flight job, then keeps the interval from its start", async () => {
    const jobs = [deferred<number>(), deferred<number>()];
    let i = 0;
    const { scheduler, capture } = make({
      capture: vi.fn(() => jobs[i++]!.promise),
    });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(500);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(scheduler.busy).toBe(true);

    jobs[0]!.resolve(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(scheduler.busy).toBe(false);
    await vi.advanceTimersByTimeAsync(499);
    expect(capture).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(capture).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it("does not start another job while a long one is pending", async () => {
    const job = deferred<number>();
    const { scheduler, capture } = make({ capture: vi.fn(() => job.promise) });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(capture).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it("pause stops capturing and resume continues", async () => {
    const { scheduler, onFrame } = make();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.pause();
    expect(scheduler.state).toBe("paused");
    await vi.advanceTimersByTimeAsync(5000);
    expect(onFrame).toHaveBeenCalledTimes(1);

    scheduler.resume();
    expect(scheduler.state).toBe("running");
    await vi.advanceTimersByTimeAsync(0);
    expect(onFrame).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it("aborts the in-flight signal and discards its late result on pause", async () => {
    const job = deferred<number>();
    let signal!: AbortSignal;
    const { scheduler, onFrame } = make({
      capture: vi.fn((s: AbortSignal) => {
        signal = s;
        return job.promise;
      }),
    });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(signal.aborted).toBe(false);
    scheduler.pause();
    expect(signal.aborted).toBe(true);

    job.resolve(99); // capture ignored the signal and resolved anyway
    await vi.advanceTimersByTimeAsync(0);
    expect(onFrame).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it("does not start a second job while a discarded one is still pending after resume", async () => {
    const first = deferred<number>();
    const { scheduler, capture } = make({
      capture: vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(2),
    });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.pause();
    scheduler.resume();
    await vi.advanceTimersByTimeAsync(5000);
    expect(capture).toHaveBeenCalledTimes(1);
    first.resolve(1); // discarded; the overdue next job starts right away
    await vi.advanceTimersByTimeAsync(0);
    expect(capture).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it("stop aborts in-flight work and discards the result", async () => {
    const job = deferred<number>();
    let signal!: AbortSignal;
    const { scheduler, onFrame } = make({
      capture: (s) => {
        signal = s;
        return job.promise;
      },
    });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.stop();
    expect(signal.aborted).toBe(true);
    job.resolve(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(onFrame).not.toHaveBeenCalled();
  });

  it("stops permanently when the external AbortSignal aborts", async () => {
    const abort = new AbortController();
    const { scheduler, capture } = make({ signal: abort.signal });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    abort.abort();
    expect(scheduler.state).toBe("stopped");
    const calls = capture.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(capture).toHaveBeenCalledTimes(calls);
    scheduler.start(); // an aborted signal cannot be restarted
    expect(scheduler.state).toBe("stopped");
  });

  it("pauses while the page is hidden and resumes when visible", async () => {
    const { scheduler, onFrame, visibility } = make();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    visibility.setHidden(true);
    expect(scheduler.state).toBe("paused");
    await vi.advanceTimersByTimeAsync(5000);
    expect(onFrame).toHaveBeenCalledTimes(1);

    visibility.setHidden(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(scheduler.state).toBe("running");
    expect(onFrame).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it("stays paused on visible if it was also manually paused", async () => {
    const { scheduler, visibility } = make();
    scheduler.start();
    scheduler.pause();
    visibility.setHidden(true);
    visibility.setHidden(false);
    expect(scheduler.state).toBe("paused");
    scheduler.stop();
  });

  it("does not start capturing when started on a hidden page", async () => {
    const { scheduler, capture, visibility } = make();
    visibility.setHidden(true);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(capture).not.toHaveBeenCalled();
    expect(scheduler.state).toBe("paused");
    scheduler.stop();
  });

  it("removes its visibility listener on stop", () => {
    const { scheduler, visibility } = make();
    scheduler.start();
    expect(visibility.listenerCount()).toBe(1);
    scheduler.stop();
    expect(visibility.listenerCount()).toBe(0);
  });

  it("reports capture errors and keeps going", async () => {
    const { scheduler, onError, onFrame } = make({
      capture: vi
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValue(7),
    });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onFrame).toHaveBeenCalledWith(7);
    expect(scheduler.state).toBe("running");
    scheduler.stop();
  });

  it("stops itself after too many consecutive failures", async () => {
    const { scheduler, onError, capture } = make({
      capture: vi.fn().mockRejectedValue(new Error("dead")),
      maxConsecutiveErrors: 3,
    });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onError).toHaveBeenCalledTimes(3);
    expect(capture).toHaveBeenCalledTimes(3);
    expect(scheduler.state).toBe("stopped");
  });

  it("resets the failure streak after a success", async () => {
    const { scheduler } = make({
      capture: vi
        .fn()
        .mockRejectedValueOnce(new Error("1"))
        .mockRejectedValueOnce(new Error("2"))
        .mockResolvedValueOnce(1)
        .mockRejectedValueOnce(new Error("3"))
        .mockRejectedValueOnce(new Error("4"))
        .mockResolvedValue(2),
      maxConsecutiveErrors: 3,
    });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(8000);
    expect(scheduler.state).toBe("running");
    scheduler.stop();
  });

  it("isolates consumer failures (sync and async) from the loop", async () => {
    const onFrame = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("sync");
      })
      .mockImplementationOnce(() => Promise.reject(new Error("async")));
    const { scheduler, onError } = make({ onFrame });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onFrame.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(scheduler.state).toBe("running");
    scheduler.stop();
  });

  it("enforces a minimum interval", async () => {
    const { scheduler, capture } = make({ intervalMs: 1 });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(1000);
    scheduler.stop();
    expect(capture.mock.calls.length).toBeLessThanOrEqual(11);
  });

  it("notifies state changes", async () => {
    const onStateChange = vi.fn();
    const { scheduler } = make({ onStateChange });
    scheduler.start();
    scheduler.pause();
    scheduler.resume();
    scheduler.stop();
    expect(onStateChange.mock.calls.map((c) => c[0])).toEqual([
      "running",
      "paused",
      "running",
      "stopped",
    ]);
  });
});
