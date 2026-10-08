import type { TtsProvider, TtsUtteranceOptions } from "./tts-provider";

export class WebTtsProvider implements TtsProvider {
  private synth: SpeechSynthesis | null;

  onEnd: (() => void) | null = null;
  onError: ((error: unknown) => void) | null = null;

  constructor(synth?: SpeechSynthesis) {
    this.synth =
      synth ?? (typeof window !== "undefined" ? window.speechSynthesis : null);
  }

  get isSupported(): boolean {
    return this.synth !== null;
  }

  get isSpeaking(): boolean {
    return this.synth?.speaking ?? false;
  }

  speak(text: string, options: TtsUtteranceOptions): void {
    if (!this.synth) return;

    this.stop();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options.rate;
    utterance.pitch = options.pitch;
    utterance.volume = options.volume;

    utterance.onend = () => {
      this.onEnd?.();
    };

    utterance.onerror = (event) => {
      if (event.error === "canceled" || event.error === "interrupted") {
        return;
      }
      this.onError?.(event);
    };

    this.synth.speak(utterance);
  }

  stop(): void {
    this.synth?.cancel();
  }

  pause(): void {
    this.synth?.pause();
  }

  resume(): void {
    this.synth?.resume();
  }
}
