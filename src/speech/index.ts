export {
  DEFAULT_VOICE_SETTINGS,
  DUPLICATE_COOLDOWN_MS,
  SPEECH_PRIORITY_RANK,
  VOICE_SETTINGS_LIMITS,
  VOICE_SETTINGS_STORAGE_KEY,
} from "./config";
export type { VoiceSettings } from "./config";
export { utteranceOptionsFromSettings } from "./tts-provider";
export type { TtsProvider, TtsUtteranceOptions } from "./tts-provider";
export { WebTtsProvider } from "./web-tts-provider";
export { SpeechQueue } from "./speech-queue";
export type { QueueEntry } from "./speech-queue";
export { DuplicateSuppression } from "./duplicate-suppression";
export { SpeechEngine } from "./speech-engine";
export type { SpeechEngineOptions } from "./speech-engine";
export { loadVoiceSettings, saveVoiceSettings } from "./preferences";
export { useSpeech } from "./use-speech";
export type { UseSpeechReturn } from "./use-speech";
