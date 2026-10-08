import type { SpeechPriority } from "@/core";

export interface VoiceSettings {
  readonly rate: number;
  readonly pitch: number;
  readonly volume: number;
  readonly enabled: boolean;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  enabled: true,
};

export const VOICE_SETTINGS_LIMITS = {
  rate: { min: 0.5, max: 3.0 },
  pitch: { min: 0.5, max: 2.0 },
  volume: { min: 0.0, max: 1.0 },
} as const;

export const SPEECH_PRIORITY_RANK: Record<SpeechPriority, number> = {
  critical: 0,
  high: 1,
  navigation: 2,
  information: 3,
  low: 4,
};

export const DUPLICATE_COOLDOWN_MS: Record<SpeechPriority, number> = {
  critical: 3_000,
  high: 5_000,
  navigation: 8_000,
  information: 10_000,
  low: 15_000,
};

export const VOICE_SETTINGS_STORAGE_KEY = "blind-nav:voice-settings";
