import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebTtsProvider } from "./web-tts-provider";

interface FakeUtterance {
  text: string;
  rate: number;
  pitch: number;
  volume: number;
  onend: ((event: Event) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

let utterances: FakeUtterance[];

class MockSpeechSynthesisUtterance implements FakeUtterance {
  text: string;
  rate = 1;
  pitch = 1;
  volume = 1;
  onend: ((event: Event) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;

  constructor(text: string) {
    this.text = text;
    utterances.push(this);
  }
}

function fakeSynth() {
  let speakingState = false;

  const synth = {
    get speaking() {
      return speakingState;
    },
    speak(_utterance: FakeUtterance) {
      speakingState = true;
    },
    cancel() {
      speakingState = false;
    },
    pause: vi.fn(),
    resume: vi.fn(),
  } as unknown as SpeechSynthesis;

  return {
    synth,
    setSpeaking(v: boolean) {
      speakingState = v;
    },
  };
}

beforeEach(() => {
  utterances = [];
  vi.stubGlobal("SpeechSynthesisUtterance", MockSpeechSynthesisUtterance);
  return () => {
    vi.unstubAllGlobals();
  };
});

describe("WebTtsProvider", () => {
  it("reports supported when synth is available", () => {
    const { synth } = fakeSynth();
    const provider = new WebTtsProvider(synth);
    expect(provider.isSupported).toBe(true);
  });

  it("reports unsupported when constructed without synth on a non-browser env", () => {
    const origSynth = globalThis.window?.speechSynthesis;
    const origWindow = globalThis.window;

    delete (globalThis as Record<string, unknown>)["window"];
    const provider = new WebTtsProvider();
    expect(provider.isSupported).toBe(false);
    (globalThis as Record<string, unknown>)["window"] = origWindow;
    if (origSynth) {
      Object.defineProperty(window, "speechSynthesis", {
        value: origSynth,
        writable: true,
        configurable: true,
      });
    }
  });

  it("speaks with given options", () => {
    const { synth } = fakeSynth();
    const provider = new WebTtsProvider(synth);
    provider.speak("Hello", { rate: 1.5, pitch: 0.8, volume: 0.9 });
    expect(utterances).toHaveLength(1);
    expect(utterances[0]!.text).toBe("Hello");
    expect(utterances[0]!.rate).toBe(1.5);
    expect(utterances[0]!.pitch).toBe(0.8);
    expect(utterances[0]!.volume).toBe(0.9);
  });

  it("cancels previous utterance before speaking new one", () => {
    const { synth } = fakeSynth();
    const provider = new WebTtsProvider(synth);
    const opts = { rate: 1, pitch: 1, volume: 1 };
    provider.speak("First", opts);
    provider.speak("Second", opts);
    expect(utterances).toHaveLength(2);
    expect(utterances[1]!.text).toBe("Second");
  });

  it("fires onEnd when utterance completes", () => {
    const { synth } = fakeSynth();
    const provider = new WebTtsProvider(synth);
    const onEnd = vi.fn();
    provider.onEnd = onEnd;
    provider.speak("Test", { rate: 1, pitch: 1, volume: 1 });
    utterances[0]!.onend!(new Event("end"));
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("fires onError for non-canceled errors", () => {
    const { synth } = fakeSynth();
    const provider = new WebTtsProvider(synth);
    const onError = vi.fn();
    provider.onError = onError;
    provider.speak("Test", { rate: 1, pitch: 1, volume: 1 });
    utterances[0]!.onerror!({ error: "audio-busy" });
    expect(onError).toHaveBeenCalledOnce();
  });

  it("does not fire onError for canceled/interrupted", () => {
    const { synth } = fakeSynth();
    const provider = new WebTtsProvider(synth);
    const onError = vi.fn();
    provider.onError = onError;
    provider.speak("Test", { rate: 1, pitch: 1, volume: 1 });
    utterances[0]!.onerror!({ error: "canceled" });
    expect(onError).not.toHaveBeenCalled();
  });

  it("stop cancels speech", () => {
    const { synth, setSpeaking } = fakeSynth();
    const provider = new WebTtsProvider(synth);
    provider.speak("Test", { rate: 1, pitch: 1, volume: 1 });
    expect(provider.isSpeaking).toBe(true);
    provider.stop();
    setSpeaking(false);
    expect(provider.isSpeaking).toBe(false);
  });

  it("pause and resume delegate to synth", () => {
    const { synth } = fakeSynth();
    const provider = new WebTtsProvider(synth);
    provider.pause();
    expect(synth.pause).toHaveBeenCalled();
    provider.resume();
    expect(synth.resume).toHaveBeenCalled();
  });

  it("speak is a no-op when synth is null", () => {
    const origWindow = globalThis.window;

    delete (globalThis as Record<string, unknown>)["window"];
    const provider = new WebTtsProvider();
    (globalThis as Record<string, unknown>)["window"] = origWindow;
    expect(() =>
      provider.speak("Test", { rate: 1, pitch: 1, volume: 1 }),
    ).not.toThrow();
  });
});
