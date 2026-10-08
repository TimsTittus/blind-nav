import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceInput } from "./voice-input";
import type { VoiceInputResult, VoiceInputState } from "./voice-input";

describe("VoiceInput", () => {
  describe("without SpeechRecognition", () => {
    it("starts in unsupported state when API is unavailable", () => {
      const input = new VoiceInput();
      expect(input.state).toBe("unsupported");
      expect(input.isSupported).toBe(false);
    });

    it("getSnapshot returns the current state", () => {
      const input = new VoiceInput();
      expect(input.getSnapshot()).toBe("unsupported");
    });

    it("startListening is a no-op when unsupported", () => {
      const input = new VoiceInput();
      input.startListening();
      expect(input.state).toBe("unsupported");
    });
  });

  describe("with SpeechRecognition", () => {
    let mockRecognition: MockSpeechRecognition;

    beforeEach(() => {
      mockRecognition = new MockSpeechRecognition();
      vi.stubGlobal(
        "SpeechRecognition",
        class {
          lang = "";
          continuous = false;
          interimResults = false;
          maxAlternatives = 1;
          onresult: ((e: unknown) => void) | null = null;
          onerror: ((e: unknown) => void) | null = null;
          onend: (() => void) | null = null;
          start = vi.fn(() => {
            mockRecognition.instance = this;
          });
          stop = vi.fn();
          abort = vi.fn();
        },
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it("starts in idle state when API is available", () => {
      const input = new VoiceInput();
      expect(input.state).toBe("idle");
      expect(input.isSupported).toBe(true);
    });

    it("transitions to listening on startListening", () => {
      const input = new VoiceInput();
      input.startListening();
      expect(input.state).toBe("listening");
    });

    it("transitions back to idle on stopListening", () => {
      const input = new VoiceInput();
      input.startListening();
      input.stopListening();
      expect(input.state).toBe("idle");
    });

    it("calls onResult with final transcript", () => {
      const results: VoiceInputResult[] = [];
      const input = new VoiceInput({
        onResult: (r) => results.push(r),
      });
      input.startListening();
      mockRecognition.simulateResult("hello world", 0.9, true);
      expect(results).toHaveLength(1);
      expect(results[0]!.transcript).toBe("hello world");
      expect(results[0]!.confidence).toBe(0.9);
      expect(results[0]!.isFinal).toBe(true);
    });

    it("transitions to processing on final result", () => {
      const input = new VoiceInput();
      input.startListening();
      mockRecognition.simulateResult("hello", 0.9, true);
      expect(input.state).toBe("processing");
    });

    it("calls onResult with interim transcript", () => {
      const results: VoiceInputResult[] = [];
      const input = new VoiceInput({
        onResult: (r) => results.push(r),
      });
      input.startListening();
      mockRecognition.simulateResult("hel", 0.5, false);
      expect(results).toHaveLength(1);
      expect(results[0]!.isFinal).toBe(false);
    });

    it("transitions to denied on not-allowed error", () => {
      const errors: string[] = [];
      const input = new VoiceInput({
        onError: (e) => errors.push(e),
      });
      input.startListening();
      mockRecognition.simulateError("not-allowed");
      expect(input.state).toBe("denied");
      expect(errors[0]).toContain("denied");
    });

    it("transitions to idle on no-speech error", () => {
      const input = new VoiceInput();
      input.startListening();
      mockRecognition.simulateError("no-speech");
      expect(input.state).toBe("idle");
    });

    it("transitions to error on other errors", () => {
      const input = new VoiceInput();
      input.startListening();
      mockRecognition.simulateError("audio-capture");
      expect(input.state).toBe("error");
    });

    it("notifies listeners on state changes", () => {
      const input = new VoiceInput();
      const listener = vi.fn();
      input.subscribe(listener);
      input.startListening();
      expect(listener).toHaveBeenCalled();
    });

    it("unsubscribe stops notifications", () => {
      const input = new VoiceInput();
      const listener = vi.fn();
      const unsub = input.subscribe(listener);
      unsub();
      input.startListening();
      expect(listener).not.toHaveBeenCalled();
    });

    it("calls onStateChange callback", () => {
      const states: VoiceInputState[] = [];
      const input = new VoiceInput({
        onStateChange: (s) => states.push(s),
      });
      input.startListening();
      expect(states).toContain("listening");
    });
  });

  describe("submitText", () => {
    it("fires onResult with confidence 1 and isFinal true", () => {
      const results: VoiceInputResult[] = [];
      const input = new VoiceInput({
        onResult: (r) => results.push(r),
      });
      input.submitText("Where am I?");
      expect(results).toHaveLength(1);
      expect(results[0]!.transcript).toBe("Where am I?");
      expect(results[0]!.confidence).toBe(1);
      expect(results[0]!.isFinal).toBe(true);
    });

    it("transitions to processing", () => {
      const input = new VoiceInput();
      input.submitText("test");
      expect(input.state).toBe("processing");
    });

    it("ignores empty text", () => {
      const results: VoiceInputResult[] = [];
      const input = new VoiceInput({
        onResult: (r) => results.push(r),
      });
      input.submitText("   ");
      expect(results).toHaveLength(0);
    });

    it("trims whitespace", () => {
      const results: VoiceInputResult[] = [];
      const input = new VoiceInput({
        onResult: (r) => results.push(r),
      });
      input.submitText("  hello  ");
      expect(results[0]!.transcript).toBe("hello");
    });
  });

  describe("resetState", () => {
    it("resets to idle from processing", () => {
      const input = new VoiceInput();
      input.submitText("test");
      expect(input.state).toBe("processing");
      input.resetState();
      expect(input.state).toBe("idle");
    });
  });

  describe("dispose", () => {
    it("clears listeners", () => {
      const input = new VoiceInput();
      const listener = vi.fn();
      input.subscribe(listener);
      input.dispose();
      input.submitText("test");
      expect(listener).not.toHaveBeenCalled();
    });
  });
});

class MockSpeechRecognition {
  instance: {
    onresult: ((e: unknown) => void) | null;
    onerror: ((e: unknown) => void) | null;
    onend: (() => void) | null;
  } | null = null;

  simulateResult(
    transcript: string,
    confidence: number,
    isFinal: boolean,
  ): void {
    this.instance?.onresult?.({
      resultIndex: 0,
      results: {
        length: 1,
        item: () => null,
        0: {
          isFinal,
          length: 1,
          item: () => null,
          0: { transcript, confidence },
        },
      },
    });
  }

  simulateError(error: string): void {
    this.instance?.onerror?.({ error });
  }
}
