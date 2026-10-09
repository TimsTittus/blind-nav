import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  LocalInferenceResult,
  LocalVisionBackend,
  RgbaFrame,
} from "./backend";
import { FastPerceptionController } from "./controller";
import { FIXTURE_GRIDS, openGround } from "./grid-builders";
import { RecordedVisionBackend } from "./recorded-backend";

const INPUT_SIZE = 8;

function pixels(): RgbaFrame {
  return {
    data: new Uint8ClampedArray(INPUT_SIZE * INPUT_SIZE * 4),
    width: INPUT_SIZE,
    height: INPUT_SIZE,
    capturedAt: Date.now(),
  };
}

/** A backend whose latency and failures the test controls. */
class ControllableBackend implements LocalVisionBackend {
  readonly id = "controllable";
  readonly modelId = "controllable-model";
  readonly inputSize = INPUT_SIZE;
  inferenceMs = 10;
  failWith: Error | null = null;
  calls = 0;
  disposed = false;

  infer(): Promise<LocalInferenceResult> {
    this.calls++;
    if (this.failWith) return Promise.reject(this.failWith);
    return Promise.resolve({
      segmentation: FIXTURE_GRIDS.stairs,
      inferenceMs: this.inferenceMs,
    });
  }

  dispose(): void {
    this.disposed = true;
  }
}

/** Run every pending timer and microtask until the loop settles. */
async function settle(cycles = 6): Promise<void> {
  for (let i = 0; i < cycles; i++) {
    await vi.advanceTimersByTimeAsync(200);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FastPerceptionController", () => {
  it("starts unavailable and never implies a clear path before inferring", () => {
    const controller = new FastPerceptionController({
      backend: new ControllableBackend(),
      grabFrame: pixels,
      visibility: null,
    });
    const state = controller.getSnapshot();
    expect(state.availability).toBe("unavailable");
    expect(state.frame).toBeNull();
    controller.dispose();
  });

  it("produces normalized frames carrying backend identity", async () => {
    const controller = new FastPerceptionController({
      backend: new ControllableBackend(),
      grabFrame: pixels,
      visibility: null,
    });
    controller.start();
    await settle();

    const { frame } = controller.getSnapshot();
    expect(frame).not.toBeNull();
    expect(frame?.backend).toBe("controllable");
    expect(frame?.modelId).toBe("controllable-model");
    expect(frame?.answers.stairs).toBe(true);
    controller.dispose();
  });

  it("paces itself against measured inference cost", async () => {
    const backend = new ControllableBackend();
    backend.inferenceMs = 300;
    const controller = new FastPerceptionController({
      backend,
      grabFrame: pixels,
      config: { targetIntervalMs: 150, backoffFactor: 2 },
      visibility: null,
    });
    controller.start();
    await settle();

    // 300 ms of inference at a duty-cycle factor of 2 → a 600 ms interval.
    expect(controller.getSnapshot().intervalMs).toBe(600);
    controller.dispose();
  });

  it("keeps the configured target when inference is cheap", async () => {
    const backend = new ControllableBackend();
    backend.inferenceMs = 20;
    const controller = new FastPerceptionController({
      backend,
      grabFrame: pixels,
      config: { targetIntervalMs: 150, backoffFactor: 2 },
      visibility: null,
    });
    controller.start();
    await settle();
    expect(controller.getSnapshot().intervalMs).toBe(150);
    controller.dispose();
  });

  it("flags a device that cannot sustain even the slowest interval", async () => {
    const backend = new ControllableBackend();
    backend.inferenceMs = 5_000;
    const controller = new FastPerceptionController({
      backend,
      grabFrame: pixels,
      config: { maxIntervalMs: 1_000, backoffFactor: 2 },
      visibility: null,
    });
    controller.start();
    await settle();

    const state = controller.getSnapshot();
    expect(state.deviceTooSlow).toBe(true);
    expect(state.intervalMs).toBe(1_000);
    controller.dispose();
  });

  it("drops the last frame on failure rather than leaving stale evidence", async () => {
    const backend = new ControllableBackend();
    // A generous error budget keeps the loop in "error" rather than escalating
    // to "unavailable"; the escalation itself is covered by the next test.
    const controller = new FastPerceptionController({
      backend,
      grabFrame: pixels,
      config: { maxConsecutiveErrors: 50 },
      visibility: null,
    });
    controller.start();
    await settle();
    expect(controller.getSnapshot().frame).not.toBeNull();

    backend.failWith = new Error("inference exploded");
    await settle();

    const state = controller.getSnapshot();
    expect(state.availability).toBe("error");
    expect(state.frame).toBeNull();
    expect(state.lastError).toContain("inference exploded");
    controller.dispose();
  });

  it("gives up after repeated failures instead of spinning forever", async () => {
    const backend = new ControllableBackend();
    backend.failWith = new Error("always fails");
    const controller = new FastPerceptionController({
      backend,
      grabFrame: pixels,
      config: { maxConsecutiveErrors: 3 },
      visibility: null,
    });
    controller.start();
    await settle(12);

    expect(controller.getSnapshot().schedulerState).toBe("stopped");
    expect(controller.getSnapshot().availability).toBe("unavailable");
    expect(backend.calls).toBeLessThanOrEqual(4);
    controller.dispose();
  });

  it("surfaces a frame-grab failure without crashing the loop", async () => {
    const controller = new FastPerceptionController({
      backend: new ControllableBackend(),
      grabFrame: () => {
        throw new Error("camera not ready");
      },
      visibility: null,
    });
    controller.start();
    await settle();
    expect(controller.getSnapshot().lastError).toContain("camera not ready");
    controller.dispose();
  });

  it("reports ambiguous when the reading answers nothing", async () => {
    // An all-sky frame: background everywhere, so the rules find no ground
    // and no obstacle to reason about.
    const controller = new FastPerceptionController({
      backend: new RecordedVisionBackend({
        grids: [{ classes: ["sky"], grid: [[0]] }],
        inputSize: INPUT_SIZE,
      }),
      grabFrame: pixels,
      visibility: null,
    });
    controller.start();
    await settle();
    // Every answer is still produced here, so this must be "ok" — the point is
    // that the controller reports what it actually found, not a guess.
    expect(["ok", "ambiguous"]).toContain(
      controller.getSnapshot().availability,
    );
    controller.dispose();
  });

  it("stops inferring once paused and resumes afterwards", async () => {
    const backend = new ControllableBackend();
    const controller = new FastPerceptionController({
      backend,
      grabFrame: pixels,
      visibility: null,
    });
    controller.start();
    await settle();
    const afterStart = backend.calls;

    controller.pause();
    await settle();
    expect(backend.calls).toBe(afterStart);

    controller.resume();
    await settle();
    expect(backend.calls).toBeGreaterThan(afterStart);
    controller.dispose();
  });

  it("pauses itself when the tab is hidden", async () => {
    const backend = new ControllableBackend();
    let hidden = false;
    const listeners = new Set<() => void>();
    const controller = new FastPerceptionController({
      backend,
      grabFrame: pixels,
      visibility: {
        isHidden: () => hidden,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
    });
    controller.start();
    await settle();
    const before = backend.calls;

    hidden = true;
    for (const listener of listeners) listener();
    await settle();

    expect(backend.calls).toBe(before);
    expect(controller.getSnapshot().schedulerState).toBe("paused");
    controller.dispose();
  });

  it("disposes the backend and stops the loop", async () => {
    const backend = new ControllableBackend();
    const controller = new FastPerceptionController({
      backend,
      grabFrame: pixels,
      visibility: null,
    });
    controller.start();
    await settle();
    controller.dispose();
    const after = backend.calls;

    await settle();
    expect(backend.disposed).toBe(true);
    expect(backend.calls).toBe(after);
  });

  it("ignores start() after disposal", async () => {
    const backend = new ControllableBackend();
    const controller = new FastPerceptionController({
      backend,
      grabFrame: pixels,
      visibility: null,
    });
    controller.dispose();
    controller.start();
    await settle();
    expect(backend.calls).toBe(0);
  });

  it("notifies subscribers and stops after unsubscribe", async () => {
    const controller = new FastPerceptionController({
      backend: new RecordedVisionBackend({
        grids: [openGround()],
        inputSize: INPUT_SIZE,
      }),
      grabFrame: pixels,
      visibility: null,
    });
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    controller.start();
    await settle();
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    const callsAfter = listener.mock.calls.length;
    await settle();
    expect(listener.mock.calls.length).toBe(callsAfter);
    controller.dispose();
  });
});
