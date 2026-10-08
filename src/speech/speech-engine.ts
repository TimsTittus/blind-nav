import type { SpeechPriority } from "@/core";
import type { VoiceSettings } from "./config";
import { DuplicateSuppression } from "./duplicate-suppression";
import { SpeechQueue, type QueueEntry } from "./speech-queue";
import type { TtsProvider } from "./tts-provider";
import { utteranceOptionsFromSettings } from "./tts-provider";

export interface SpeechEngineOptions {
  provider: TtsProvider;
  settings: VoiceSettings;
  cooldownOverrides?: Record<SpeechPriority, number>;
  now?: () => number;
  onStateChange?: () => void;
}

let nextId = 0;

export class SpeechEngine {
  private readonly provider: TtsProvider;
  private readonly queue: SpeechQueue;
  private readonly suppression: DuplicateSuppression;
  private readonly now: () => number;
  private _settings: VoiceSettings;
  private _paused = false;
  private disposed = false;

  onStateChange: (() => void) | null;

  constructor(options: SpeechEngineOptions) {
    this.provider = options.provider;
    this.queue = new SpeechQueue();
    this.suppression = new DuplicateSuppression(options.cooldownOverrides);
    this._settings = options.settings;
    this.now = options.now ?? (() => Date.now());
    this.onStateChange = options.onStateChange ?? null;

    this.provider.onEnd = () => {
      this.queue.markDone();
      this.advance();
      this.onStateChange?.();
    };

    this.provider.onError = () => {
      this.queue.markDone();
      this.advance();
      this.onStateChange?.();
    };
  }

  get settings(): VoiceSettings {
    return this._settings;
  }

  set settings(value: VoiceSettings) {
    this._settings = value;
  }

  get isSpeaking(): boolean {
    return this.provider.isSpeaking;
  }

  get isSupported(): boolean {
    return this.provider.isSupported;
  }

  get isPaused(): boolean {
    return this._paused;
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get currentEntry(): QueueEntry | null {
    return this.queue.current;
  }

  speak(text: string, priority: SpeechPriority): boolean {
    if (this.disposed) return false;
    if (!this._settings.enabled) return false;

    const now = this.now();

    if (this.suppression.isSuppressed(text, now)) {
      return false;
    }

    const entry: QueueEntry = {
      id: `speech-${String(++nextId)}`,
      text,
      priority,
      createdAt: now,
    };

    this.suppression.record(text, priority, now);

    const { shouldInterrupt } = this.queue.enqueue(entry);

    if (shouldInterrupt) {
      this.provider.stop();
      this.queue.markDone();
      this.advance();
    } else if (!this.provider.isSpeaking && !this._paused) {
      this.advance();
    }

    return true;
  }

  stop(): void {
    this.provider.stop();
    this.queue.clear();
    this.onStateChange?.();
  }

  pause(): void {
    this._paused = true;
    this.provider.pause();
    this.onStateChange?.();
  }

  resume(): void {
    this._paused = false;
    this.provider.resume();
    if (!this.provider.isSpeaking) {
      this.advance();
    }
    this.onStateChange?.();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.suppression.clear();
    this.provider.onEnd = null;
    this.provider.onError = null;
    this.onStateChange = null;
  }

  private advance(): void {
    if (this.disposed || this._paused) return;
    if (!this._settings.enabled) return;

    const entry = this.queue.dequeue();
    if (entry === undefined) return;

    this.provider.speak(
      entry.text,
      utteranceOptionsFromSettings(this._settings),
    );
  }
}
