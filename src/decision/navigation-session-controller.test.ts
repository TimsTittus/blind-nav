import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, type SceneAnalysis } from "@/core";
import type { AnalysisClient } from "@/perception";
import { NavigationSessionController } from "./navigation-session-controller";

function makeAnalysis(overrides?: Partial<SceneAnalysis>): SceneAnalysis {
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
    ...overrides,
  };
}

function createMockClient(analysis?: SceneAnalysis): AnalysisClient {
  return {
    analyze: vi.fn().mockResolvedValue({
      ok: true,
      analysis: analysis ?? makeAnalysis(),
    }),
  };
}


const session = createSession({
  mode: "navigate",
  destination: { id: "d1", label: "Test" },
});

// Mock browser APIs the subsystems need
beforeEach(() => {
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

  // SpeechSynthesis
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
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("NavigationSessionController", () => {
  it("starts in idle phase", () => {
    const client = createMockClient();
    const ctrl = new NavigationSessionController({ analysisClient: client });
    expect(ctrl.getSnapshot().phase).toBe("idle");
  });

  it("transitions to running on start", async () => {
    const client = createMockClient();
    const ctrl = new NavigationSessionController({ analysisClient: client });

    await ctrl.start(session);
    expect(ctrl.getSnapshot().phase).toBe("running");
  });

  it("transitions to stopped on stop", async () => {
    const client = createMockClient();
    const ctrl = new NavigationSessionController({ analysisClient: client });

    await ctrl.start(session);
    ctrl.stop();
    expect(ctrl.getSnapshot().phase).toBe("stopped");
  });

  it("transitions through pause and resume", async () => {
    const client = createMockClient();
    const ctrl = new NavigationSessionController({ analysisClient: client });

    await ctrl.start(session);
    ctrl.pause();
    expect(ctrl.getSnapshot().phase).toBe("paused");
    ctrl.resume();
    expect(ctrl.getSnapshot().phase).toBe("running");
  });

  it("ignores start when already running", async () => {
    const client = createMockClient();
    const ctrl = new NavigationSessionController({ analysisClient: client });
    await ctrl.start(session);

    await ctrl.start(session);
    expect(ctrl.getSnapshot().phase).toBe("running");
  });

  it("ignores stop when already idle", () => {
    const client = createMockClient();
    const ctrl = new NavigationSessionController({ analysisClient: client });
    ctrl.stop();
    expect(ctrl.getSnapshot().phase).toBe("idle");
  });

  it("notifies listeners on state changes", async () => {
    const client = createMockClient();
    const ctrl = new NavigationSessionController({ analysisClient: client });
    const listener = vi.fn();

    ctrl.subscribe(listener);
    await ctrl.start(session);

    expect(listener).toHaveBeenCalled();
  });

  it("unsubscribe stops notifications", async () => {
    const client = createMockClient();
    const ctrl = new NavigationSessionController({ analysisClient: client });
    const listener = vi.fn();

    const unsub = ctrl.subscribe(listener);
    unsub();
    await ctrl.start(session);

    expect(listener).not.toHaveBeenCalled();
  });

  it("provides default safety assessment of unknown", () => {
    const client = createMockClient();
    const ctrl = new NavigationSessionController({ analysisClient: client });
    expect(ctrl.getSnapshot().safety.level).toBe("unknown");
  });

  it("shows perception freshness as none before start", () => {
    const client = createMockClient();
    const ctrl = new NavigationSessionController({ analysisClient: client });
    expect(ctrl.getSnapshot().perceptionFreshness).toBe("none");
  });

  it("initializes stats to zero", () => {
    const client = createMockClient();
    const ctrl = new NavigationSessionController({ analysisClient: client });
    const stats = ctrl.getSnapshot().stats;
    expect(stats.fps).toBe(0);
    expect(stats.aiRequestCount).toBe(0);
    expect(stats.aiLatencyMs).toBeNull();
    expect(stats.lastAnalysisAt).toBeNull();
    expect(stats.lastSpeechAt).toBeNull();
  });

  it("disposes cleanly without errors", async () => {
    const client = createMockClient();
    const ctrl = new NavigationSessionController({ analysisClient: client });
    await ctrl.start(session);
    ctrl.dispose();
    expect(ctrl.getSnapshot().phase).toBe("stopped");
  });

  it("can restart after stop", async () => {
    const client = createMockClient();
    const ctrl = new NavigationSessionController({ analysisClient: client });
    await ctrl.start(session);
    ctrl.stop();
    await ctrl.start(session);
    expect(ctrl.getSnapshot().phase).toBe("running");
  });

  it("handles rapid start/stop cycles", async () => {
    const client = createMockClient();
    const ctrl = new NavigationSessionController({ analysisClient: client });

    await ctrl.start(session);
    ctrl.stop();
    await ctrl.start(session);
    ctrl.stop();
    await ctrl.start(session);
    ctrl.stop();

    expect(ctrl.getSnapshot().phase).toBe("stopped");
  });

  it("toggles voice settings", async () => {
    const client = createMockClient();
    const ctrl = new NavigationSessionController({
      analysisClient: client,
      voiceSettings: { enabled: true, rate: 1, pitch: 1, volume: 1 },
    });

    ctrl.toggleVoice();
    await ctrl.start(session);
    expect(ctrl.getSnapshot().phase).toBe("running");
  });
});

describe("NavigationSessionController (error handling)", () => {
  it("keeps running when camera fails (degraded mode)", async () => {
    const failTrack = {
      stop: vi.fn(),
      kind: "video",
      getSettings: () => ({ facingMode: "environment" }),
      getCapabilities: () => ({}),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new Error("No camera")),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
      geolocation: null,
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
    void failTrack;

    const client = createMockClient();
    const ctrl = new NavigationSessionController({ analysisClient: client });
    await ctrl.start(session);

    expect(ctrl.getSnapshot().phase).toBe("running");
    expect(ctrl.getSnapshot().camera).toBe("error");
  });
});

describe("SpeechDispatch via controller snapshot", () => {
  it("shows initial route state as idle", () => {
    const client = createMockClient();
    const ctrl = new NavigationSessionController({ analysisClient: client });
    expect(ctrl.getSnapshot().route.status).toBe("idle");
  });
});
