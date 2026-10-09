/**
 * Integration: the session controller running both perception loops.
 *
 * The local loop is driven by a recorded backend, so these tests cover the
 * wiring (two cadences, fusion before safety, lifecycle, speech rate) rather
 * than model behaviour.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, type SceneAnalysis } from "@/core";
import {
  FIXTURE_GRIDS,
  RecordedVisionBackend,
  type LocalVisionBackend,
  type RgbaFrame,
} from "@/fast-perception";
import type { AnalysisClient } from "@/perception";
import { NavigationSessionController } from "./navigation-session-controller";

const session = createSession({
  mode: "navigate",
  destination: { id: "d1", label: "Test" },
});

function clearAnalysis(): SceneAnalysis {
  return {
    sceneType: "sidewalk",
    pathStatus: "clear",
    terrain: "even",
    overallConfidence: 0.9,
    uncertainty: "low",
    obstacles: [],
    hazards: [],
    recommendedImmediateAction: "continue",
    description: "Clear sidewalk",
    analysisId: crypto.randomUUID(),
    capturedAt: Date.now(),
    analyzedAt: Date.now(),
    availability: "ok",
    provider: "fixture",
  };
}

function cloudClient(analysis?: SceneAnalysis): AnalysisClient {
  return {
    analyze: vi
      .fn()
      .mockResolvedValue({ ok: true, analysis: analysis ?? clearAnalysis() }),
  };
}

function backendFor(scene: keyof typeof FIXTURE_GRIDS): LocalVisionBackend {
  return new RecordedVisionBackend({
    grids: [FIXTURE_GRIDS[scene]],
    inputSize: 8,
  });
}

/** jsdom has no live video, so the pixel grab is injected. */
const grabFastFrame = (size: number): RgbaFrame => ({
  data: new Uint8ClampedArray(size * size * 4),
  width: size,
  height: size,
  capturedAt: Date.now(),
});

/** jsdom has no real video or canvas pixels; the grab path is stubbed. */
function stubVideoAndCanvas(): void {
  const mockTrack = {
    stop: vi.fn(),
    kind: "video",
    getSettings: () => ({ facingMode: "environment" }),
    getCapabilities: () => ({}),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [mockTrack],
        getVideoTracks: () => [mockTrack],
      }),
      enumerateDevices: vi.fn().mockResolvedValue([]),
    },
    geolocation: null,
  });
  vi.stubGlobal("speechSynthesis", {
    speak: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: vi.fn().mockReturnValue([]),
    speaking: false,
    paused: false,
    pending: false,
    onvoiceschanged: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      text = "";
      rate = 1;
      pitch = 1;
      volume = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
    },
  );
}

beforeEach(() => {
  stubVideoAndCanvas();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("session controller — local perception", () => {
  it("reports local perception unavailable when no backend is configured", async () => {
    const ctrl = new NavigationSessionController({
      analysisClient: cloudClient(),
    });
    await ctrl.start(session);
    await vi.waitFor(() => {
      expect(ctrl.getSnapshot().fastPerceptionError).toBe(
        "Local perception is not configured.",
      );
    });
    expect(ctrl.getSnapshot().fastPerception.availability).toBe("unavailable");
    expect(ctrl.getSnapshot().phase).toBe("running");
    ctrl.dispose();
  });

  it("keeps the session running when the backend cannot be created", async () => {
    // The default deployment case: the app ships without weights.
    const ctrl = new NavigationSessionController({
      analysisClient: cloudClient(),
      createFastBackend: () =>
        Promise.reject(
          new Error("Local model is not available at /models/x.onnx"),
        ),
    });
    await ctrl.start(session);
    await vi.waitFor(() => {
      expect(ctrl.getSnapshot().fastPerceptionError).toContain("not available");
    });
    expect(ctrl.getSnapshot().phase).toBe("running");
    ctrl.dispose();
  });

  it("respects the config flag that disables the local loop", async () => {
    const ctrl = new NavigationSessionController({
      analysisClient: cloudClient(),
      createFastBackend: () => Promise.resolve(backendFor("stairs")),
      config: { fastPerceptionEnabled: false },
    });
    await ctrl.start(session);
    await vi.waitFor(() => {
      expect(ctrl.getSnapshot().fastPerceptionError).toContain("disabled");
    });
    ctrl.dispose();
  });

  it("disposes a backend that finished loading after the session stopped", async () => {
    const backend = backendFor("stairs");
    const disposed = vi.spyOn(backend, "dispose");
    const deferred: { resolve: (b: LocalVisionBackend) => void } = {
      resolve: () => {},
    };
    const ctrl = new NavigationSessionController({
      analysisClient: cloudClient(),
      createFastBackend: () =>
        new Promise<LocalVisionBackend>((resolve) => {
          deferred.resolve = resolve;
        }),
    });
    await ctrl.start(session);
    ctrl.stop();
    deferred.resolve(backend);
    await vi.waitFor(() => {
      expect(disposed).toHaveBeenCalled();
    });
    ctrl.dispose();
  });

  it("exposes fusion provenance once both sources have reported", async () => {
    const ctrl = new NavigationSessionController({
      analysisClient: cloudClient(),
      createFastBackend: () => Promise.resolve(backendFor("stairs")),
      grabFastFrame,
    });
    await ctrl.start(session);
    await vi.waitFor(
      () => {
        expect(ctrl.getSnapshot().fusion).not.toBeNull();
      },
      { timeout: 3_000 },
    );
    const { fusion } = ctrl.getSnapshot();
    expect(fusion?.sources.map((s) => s.source)).toEqual(["cloud", "local"]);
    ctrl.dispose();
  });

  it("does not let local evidence report a clear path as safe", async () => {
    const ctrl = new NavigationSessionController({
      analysisClient: cloudClient(),
      createFastBackend: () => Promise.resolve(backendFor("stairs")),
      grabFastFrame,
    });
    await ctrl.start(session);
    await vi.waitFor(
      () => {
        expect(ctrl.getSnapshot().fastPerception.frame).not.toBeNull();
      },
      { timeout: 3_000 },
    );
    // The cloud says "clear"; the local model sees stairs. The merged
    // assessment must not be "safe".
    await vi.waitFor(() => {
      expect(ctrl.getSnapshot().safety.level).not.toBe("safe");
    });
    ctrl.dispose();
  });

  it("counts local inferences in session stats", async () => {
    const ctrl = new NavigationSessionController({
      analysisClient: cloudClient(),
      createFastBackend: () => Promise.resolve(backendFor("clear")),
      grabFastFrame,
    });
    await ctrl.start(session);
    await vi.waitFor(
      () => {
        expect(ctrl.getSnapshot().stats.localInferenceCount).toBeGreaterThan(0);
      },
      { timeout: 3_000 },
    );
    expect(ctrl.getSnapshot().stats.localLatencyMs).not.toBeNull();
    ctrl.dispose();
  });

  it("clears local state on stop", async () => {
    const ctrl = new NavigationSessionController({
      analysisClient: cloudClient(),
      createFastBackend: () => Promise.resolve(backendFor("stairs")),
      grabFastFrame,
    });
    await ctrl.start(session);
    await vi.waitFor(
      () => {
        expect(ctrl.getSnapshot().fastPerception.frame).not.toBeNull();
      },
      { timeout: 3_000 },
    );
    ctrl.stop();
    expect(ctrl.getSnapshot().fastPerception.frame).toBeNull();
    expect(ctrl.getSnapshot().fusion).toBeNull();
    ctrl.dispose();
  });

  it("does not repeat the same spoken warning on every local frame", async () => {
    const speak = vi.fn();
    const ctrl = new NavigationSessionController({
      analysisClient: cloudClient(),
      createFastBackend: () => Promise.resolve(backendFor("stairs")),
      grabFastFrame,
      config: { safetySpeechCooldownMs: 60_000 },
    });
    await ctrl.start(session);
    vi.stubGlobal("speechSynthesis", {
      speak,
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      getVoices: vi.fn().mockReturnValue([]),
      speaking: false,
      paused: false,
      pending: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    await vi.waitFor(
      () => {
        expect(
          ctrl.getSnapshot().stats.localInferenceCount,
        ).toBeGreaterThanOrEqual(3);
      },
      { timeout: 5_000 },
    );

    // Several local frames at the same safety level must not produce several
    // announcements: SpeechDispatch has no cooldown for danger/critical.
    expect(speak.mock.calls.length).toBeLessThanOrEqual(1);
    ctrl.dispose();
  });
});
