"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SpeechPriority } from "@/core";
import { DEFAULT_VOICE_SETTINGS, type VoiceSettings } from "./config";
import { loadVoiceSettings, saveVoiceSettings } from "./preferences";
import { SpeechEngine } from "./speech-engine";
import { WebTtsProvider } from "./web-tts-provider";

export interface UseSpeechReturn {
  speak: (text: string, priority: SpeechPriority) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  isSpeaking: boolean;
  isPaused: boolean;
  isSupported: boolean;
  settings: VoiceSettings;
  updateSettings: (patch: Partial<VoiceSettings>) => void;
}

function initSettings(): VoiceSettings {
  if (typeof window === "undefined") return DEFAULT_VOICE_SETTINGS;
  return loadVoiceSettings();
}

export function useSpeech(): UseSpeechReturn {
  const [settings, setSettings] = useState(initSettings);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const engineRef = useRef<SpeechEngine | null>(null);

  useEffect(() => {
    const provider = new WebTtsProvider();
    const engine = new SpeechEngine({
      provider,
      settings,
      onStateChange: () => {
        setIsSpeaking(engine.isSpeaking);
        setIsPaused(engine.isPaused);
      },
    });

    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // Engine is created once on mount with the initial settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.settings = settings;
    }
  }, [settings]);

  const speak = useCallback((text: string, priority: SpeechPriority) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.speak(text, priority);
    setIsSpeaking(engine.isSpeaking);
  }, []);

  const stop = useCallback(() => {
    engineRef.current?.stop();
  }, []);

  const pause = useCallback(() => {
    engineRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    engineRef.current?.resume();
  }, []);

  const updateSettings = useCallback((patch: Partial<VoiceSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveVoiceSettings(next);
      return next;
    });
  }, []);

  return {
    speak,
    stop,
    pause,
    resume,
    isSpeaking,
    isPaused,
    isSupported: typeof window !== "undefined" && "speechSynthesis" in window,
    settings,
    updateSettings,
  };
}
