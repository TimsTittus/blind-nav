import { afterEach, describe, expect, it, vi } from "vitest";
import type { SpeechPriority } from "@/core";
import { DEFAULT_VOICE_SETTINGS, type VoiceSettings } from "./config";
import { SpeechEngine, type SpeechEngineOptions } from "./speech-engine";
import type { TtsProvider, TtsUtteranceOptions } from "./tts-provider";

const FAST_COOLDOWNS: Record<SpeechPriority, number> = {
  critical: 50,
  high: 100,
  navigation: 150,
  information: 200,
  low: 250,
};

function fakeProvider(): TtsProvider & {
  spoken: string[];
  finishCurrent: () => void;
  failCurrent: () => void;
} {
  let speaking = false;
  const spoken: string[] = [];
  const provider: TtsProvider & {
    spoken: string[];
    finishCurrent: () => void;
    failCurrent: () => void;
  } = {
    spoken,
    get isSpeaking() {
      return speaking;
    },
    isSupported: true,
    onEnd: null,
    onError: null,
    speak(text: string, _options: TtsUtteranceOptions) {
      speaking = true;
      spoken.push(text);
    },
    stop() {
      speaking = false;
    },
    pause: vi.fn(),
    resume: vi.fn(),
    finishCurrent() {
      speaking = false;
      provider.onEnd?.();
    },
    failCurrent() {
      speaking = false;
      provider.onError?.(new Error("tts error"));
    },
  };
  return provider;
}

const engines: SpeechEngine[] = [];

function createEngine(
  provider: ReturnType<typeof fakeProvider>,
  settings: VoiceSettings = DEFAULT_VOICE_SETTINGS,
  now?: () => number,
) {
  const options: SpeechEngineOptions = {
    provider,
    settings,
    cooldownOverrides: FAST_COOLDOWNS,
  };
  if (now) options.now = now;
  const engine = new SpeechEngine(options);
  engines.push(engine);
  return engine;
}

describe("SpeechEngine", () => {
  afterEach(() => {
    for (const engine of engines) engine.dispose();
    engines.length = 0;
  });
  describe("basic speak", () => {
    it("speaks a message immediately when idle", () => {
      const p = fakeProvider();
      const engine = createEngine(p);
      engine.speak("Hello", "navigation");
      expect(p.spoken).toEqual(["Hello"]);
    });

    it("queues messages when already speaking", () => {
      const p = fakeProvider();
      const engine = createEngine(p);
      engine.speak("First", "navigation");
      engine.speak("Second", "navigation");
      expect(p.spoken).toEqual(["First"]);
      expect(engine.pendingCount).toBe(1);
    });

    it("advances to next after current ends", () => {
      const p = fakeProvider();
      const engine = createEngine(p);
      engine.speak("First", "navigation");
      engine.speak("Second", "navigation");
      p.finishCurrent();
      expect(p.spoken).toEqual(["First", "Second"]);
    });

    it("advances after error", () => {
      const p = fakeProvider();
      const engine = createEngine(p);
      engine.speak("First", "navigation");
      engine.speak("Second", "navigation");
      p.failCurrent();
      expect(p.spoken).toEqual(["First", "Second"]);
    });
  });

  describe("priority ordering", () => {
    it("dequeues higher priority first", () => {
      const p = fakeProvider();
      const engine = createEngine(p);
      engine.speak("Busy", "navigation"); // playing now
      engine.speak("Low", "low");
      engine.speak("High", "high");
      engine.speak("Info", "information");
      p.finishCurrent(); // should pick "High"
      expect(p.spoken[1]).toBe("High");
      p.finishCurrent();
      expect(p.spoken[2]).toBe("Info");
      p.finishCurrent();
      expect(p.spoken[3]).toBe("Low");
    });
  });

  describe("interruption", () => {
    it("critical interrupts low", () => {
      const p = fakeProvider();
      const engine = createEngine(p);
      engine.speak("Low msg", "low");
      engine.speak("STOP", "critical");
      expect(p.spoken).toEqual(["Low msg", "STOP"]);
    });

    it("critical interrupts high", () => {
      const p = fakeProvider();
      const engine = createEngine(p);
      engine.speak("High msg", "high");
      engine.speak("STOP", "critical");
      expect(p.spoken).toEqual(["High msg", "STOP"]);
    });

    it("high interrupts navigation", () => {
      const p = fakeProvider();
      const engine = createEngine(p);
      engine.speak("Nav msg", "navigation");
      engine.speak("Warning", "high");
      expect(p.spoken).toEqual(["Nav msg", "Warning"]);
    });

    it("high interrupts information", () => {
      const p = fakeProvider();
      const engine = createEngine(p);
      engine.speak("Info msg", "information");
      engine.speak("Warning", "high");
      expect(p.spoken).toEqual(["Info msg", "Warning"]);
    });

    it("high does not interrupt critical", () => {
      const p = fakeProvider();
      const engine = createEngine(p);
      engine.speak("STOP", "critical");
      engine.speak("Warning", "high");
      expect(p.spoken).toEqual(["STOP"]);
    });

    it("navigation interrupts low", () => {
      const p = fakeProvider();
      const engine = createEngine(p);
      engine.speak("Low msg", "low");
      engine.speak("Turn right", "navigation");
      expect(p.spoken).toEqual(["Low msg", "Turn right"]);
    });

    it("low does not interrupt information", () => {
      const p = fakeProvider();
      const engine = createEngine(p);
      engine.speak("Info msg", "information");
      engine.speak("Low msg", "low");
      expect(p.spoken).toEqual(["Info msg"]);
      expect(engine.pendingCount).toBe(1);
    });

    it("information does not interrupt navigation", () => {
      const p = fakeProvider();
      const engine = createEngine(p);
      engine.speak("Nav msg", "navigation");
      engine.speak("Info msg", "information");
      expect(p.spoken).toEqual(["Nav msg"]);
    });
  });

  describe("duplicate suppression", () => {
    it("suppresses duplicate within cooldown", () => {
      let now = 0;
      const p = fakeProvider();
      const engine = createEngine(p, DEFAULT_VOICE_SETTINGS, () => now);
      engine.speak("Path clear.", "navigation");
      p.finishCurrent();
      now = 50;
      const accepted = engine.speak("Path clear.", "navigation");
      expect(accepted).toBe(false);
      expect(p.spoken).toEqual(["Path clear."]);
    });

    it("allows duplicate after cooldown expires", () => {
      let now = 0;
      const p = fakeProvider();
      const engine = createEngine(p, DEFAULT_VOICE_SETTINGS, () => now);
      engine.speak("Path clear.", "navigation");
      p.finishCurrent();
      now = 200; // navigation cooldown is 150
      const accepted = engine.speak("Path clear.", "navigation");
      expect(accepted).toBe(true);
      expect(p.spoken).toEqual(["Path clear.", "Path clear."]);
    });

    it("does not suppress different text", () => {
      const p = fakeProvider();
      const engine = createEngine(p);
      engine.speak("Path clear.", "navigation");
      p.finishCurrent();
      const accepted = engine.speak("Obstacle ahead.", "navigation");
      expect(accepted).toBe(true);
    });

    it("suppresses rapid-fire identical messages", () => {
      let now = 0;
      const p = fakeProvider();
      const engine = createEngine(p, DEFAULT_VOICE_SETTINGS, () => now);
      for (let i = 0; i < 10; i++) {
        engine.speak("Path clear.", "low");
        now += 10;
      }
      expect(p.spoken).toEqual(["Path clear."]);
    });
  });

  describe("stop", () => {
    it("stops current speech and clears queue", () => {
      const p = fakeProvider();
      const engine = createEngine(p);
      engine.speak("First", "navigation");
      engine.speak("Second", "low");
      engine.stop();
      expect(engine.pendingCount).toBe(0);
      expect(engine.isSpeaking).toBe(false);
    });
  });

  describe("pause and resume", () => {
    it("pauses the provider", () => {
      const p = fakeProvider();
      const engine = createEngine(p);
      engine.speak("Hello", "navigation");
      engine.pause();
      expect(engine.isPaused).toBe(true);
      expect(p.pause).toHaveBeenCalled();
    });

    it("does not advance while paused", () => {
      const p = fakeProvider();
      const engine = createEngine(p);
      engine.speak("First", "navigation");
      engine.speak("Second", "low");
      engine.pause();
      p.finishCurrent();
      expect(p.spoken).toEqual(["First"]);
    });

    it("resumes and advances", () => {
      const p = fakeProvider();
      const engine = createEngine(p);
      engine.speak("First", "navigation");
      engine.speak("Second", "low");
      p.finishCurrent();
      engine.pause();
      engine.resume();
      expect(p.spoken).toEqual(["First", "Second"]);
    });
  });

  describe("enabled/disabled", () => {
    it("does not speak when disabled", () => {
      const p = fakeProvider();
      const engine = createEngine(p, {
        ...DEFAULT_VOICE_SETTINGS,
        enabled: false,
      });
      const accepted = engine.speak("Hello", "critical");
      expect(accepted).toBe(false);
      expect(p.spoken).toEqual([]);
    });

    it("stops speaking when disabled mid-session", () => {
      const p = fakeProvider();
      const engine = createEngine(p);
      engine.speak("Hello", "navigation");
      engine.settings = { ...DEFAULT_VOICE_SETTINGS, enabled: false };
      engine.speak("World", "navigation");
      expect(p.spoken).toEqual(["Hello"]);
    });
  });

  describe("dispose (session cancellation)", () => {
    it("stops all speech and rejects new messages", () => {
      const p = fakeProvider();
      const engine = createEngine(p);
      engine.speak("First", "navigation");
      engine.speak("Second", "low");
      engine.dispose();
      expect(engine.pendingCount).toBe(0);
      const accepted = engine.speak("Third", "critical");
      expect(accepted).toBe(false);
    });
  });

  describe("onStateChange", () => {
    it("fires on stop", () => {
      const p = fakeProvider();
      const engine = createEngine(p);
      const cb = vi.fn();
      engine.onStateChange = cb;
      engine.speak("Hello", "navigation");
      engine.stop();
      expect(cb).toHaveBeenCalled();
    });

    it("fires when utterance ends", () => {
      const p = fakeProvider();
      const engine = createEngine(p);
      const cb = vi.fn();
      engine.onStateChange = cb;
      engine.speak("Hello", "navigation");
      p.finishCurrent();
      expect(cb).toHaveBeenCalled();
    });
  });
});
