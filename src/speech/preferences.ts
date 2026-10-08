import {
  DEFAULT_VOICE_SETTINGS,
  VOICE_SETTINGS_LIMITS,
  VOICE_SETTINGS_STORAGE_KEY,
  type VoiceSettings,
} from "./config";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitize(raw: Record<string, unknown>): VoiceSettings {
  const d = DEFAULT_VOICE_SETTINGS;
  return {
    rate: clamp(
      typeof raw["rate"] === "number" ? raw["rate"] : d.rate,
      VOICE_SETTINGS_LIMITS.rate.min,
      VOICE_SETTINGS_LIMITS.rate.max,
    ),
    pitch: clamp(
      typeof raw["pitch"] === "number" ? raw["pitch"] : d.pitch,
      VOICE_SETTINGS_LIMITS.pitch.min,
      VOICE_SETTINGS_LIMITS.pitch.max,
    ),
    volume: clamp(
      typeof raw["volume"] === "number" ? raw["volume"] : d.volume,
      VOICE_SETTINGS_LIMITS.volume.min,
      VOICE_SETTINGS_LIMITS.volume.max,
    ),
    enabled: typeof raw["enabled"] === "boolean" ? raw["enabled"] : d.enabled,
  };
}

export function loadVoiceSettings(): VoiceSettings {
  try {
    const stored = localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY);
    if (stored === null) return DEFAULT_VOICE_SETTINGS;
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null) {
      return DEFAULT_VOICE_SETTINGS;
    }
    return sanitize(parsed as Record<string, unknown>);
  } catch {
    return DEFAULT_VOICE_SETTINGS;
  }
}

export function saveVoiceSettings(settings: VoiceSettings): void {
  try {
    localStorage.setItem(VOICE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private browsing, quota, etc.) — silently ignore.
  }
}
