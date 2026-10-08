import type { VoiceSettings } from "./config";

export interface TtsUtteranceOptions {
  readonly rate: number;
  readonly pitch: number;
  readonly volume: number;
}

export interface TtsProvider {
  speak(text: string, options: TtsUtteranceOptions): void;
  stop(): void;
  pause(): void;
  resume(): void;
  readonly isSpeaking: boolean;
  readonly isSupported: boolean;
  onEnd: (() => void) | null;
  onError: ((error: unknown) => void) | null;
}

export function utteranceOptionsFromSettings(
  settings: VoiceSettings,
): TtsUtteranceOptions {
  return {
    rate: settings.rate,
    pitch: settings.pitch,
    volume: settings.volume,
  };
}
