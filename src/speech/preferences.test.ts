import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_VOICE_SETTINGS, VOICE_SETTINGS_STORAGE_KEY } from "./config";
import { loadVoiceSettings, saveVoiceSettings } from "./preferences";

describe("preferences", () => {
  afterEach(() => {
    localStorage.clear();
  });

  describe("loadVoiceSettings", () => {
    it("returns defaults when nothing is stored", () => {
      expect(loadVoiceSettings()).toEqual(DEFAULT_VOICE_SETTINGS);
    });

    it("returns stored settings", () => {
      const settings = {
        rate: 1.5,
        pitch: 0.8,
        volume: 0.6,
        enabled: false,
      };
      localStorage.setItem(
        VOICE_SETTINGS_STORAGE_KEY,
        JSON.stringify(settings),
      );
      expect(loadVoiceSettings()).toEqual(settings);
    });

    it("clamps out-of-range values", () => {
      localStorage.setItem(
        VOICE_SETTINGS_STORAGE_KEY,
        JSON.stringify({ rate: 99, pitch: -1, volume: 5, enabled: true }),
      );
      const result = loadVoiceSettings();
      expect(result.rate).toBe(3.0);
      expect(result.pitch).toBe(0.5);
      expect(result.volume).toBe(1.0);
    });

    it("returns defaults for corrupt JSON", () => {
      localStorage.setItem(VOICE_SETTINGS_STORAGE_KEY, "not-json");
      expect(loadVoiceSettings()).toEqual(DEFAULT_VOICE_SETTINGS);
    });

    it("returns defaults for non-object JSON", () => {
      localStorage.setItem(VOICE_SETTINGS_STORAGE_KEY, "42");
      expect(loadVoiceSettings()).toEqual(DEFAULT_VOICE_SETTINGS);
    });

    it("fills missing fields with defaults", () => {
      localStorage.setItem(
        VOICE_SETTINGS_STORAGE_KEY,
        JSON.stringify({ rate: 2.0 }),
      );
      const result = loadVoiceSettings();
      expect(result.rate).toBe(2.0);
      expect(result.pitch).toBe(DEFAULT_VOICE_SETTINGS.pitch);
      expect(result.volume).toBe(DEFAULT_VOICE_SETTINGS.volume);
      expect(result.enabled).toBe(DEFAULT_VOICE_SETTINGS.enabled);
    });

    it("returns defaults when localStorage throws", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("storage error");
      });
      expect(loadVoiceSettings()).toEqual(DEFAULT_VOICE_SETTINGS);
      vi.restoreAllMocks();
    });
  });

  describe("saveVoiceSettings", () => {
    it("persists settings to localStorage", () => {
      const settings = {
        rate: 1.2,
        pitch: 0.9,
        volume: 0.8,
        enabled: true,
      };
      saveVoiceSettings(settings);
      const stored = localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY);
      expect(JSON.parse(stored!)).toEqual(settings);
    });

    it("does not throw when localStorage is unavailable", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota exceeded");
      });
      expect(() => saveVoiceSettings(DEFAULT_VOICE_SETTINGS)).not.toThrow();
      vi.restoreAllMocks();
    });
  });
});
