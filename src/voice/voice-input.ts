export type VoiceInputState =
  "idle" | "listening" | "processing" | "unsupported" | "denied" | "error";

export interface VoiceInputResult {
  readonly transcript: string;
  readonly confidence: number;
  readonly isFinal: boolean;
}

export interface VoiceInputOptions {
  readonly lang?: string;
  readonly onResult?: (result: VoiceInputResult) => void;
  readonly onStateChange?: (state: VoiceInputState) => void;
  readonly onError?: (error: string) => void;
}

type Listener = () => void;

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  item(index: number): SpeechRecognitionResultLike | null;
  [index: number]: SpeechRecognitionResultLike | undefined;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternativeLike | null;
  [index: number]: SpeechRecognitionAlternativeLike | undefined;
}

interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionErrorEventLike {
  readonly error: string;
}

function getSpeechRecognitionConstructor():
  (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as Record<string, unknown>;
  const Ctor =
    (win["SpeechRecognition"] as new () => SpeechRecognitionLike) ??
    (win["webkitSpeechRecognition"] as new () => SpeechRecognitionLike);
  return Ctor ?? null;
}

export class VoiceInput {
  private readonly options: VoiceInputOptions;
  private recognition: SpeechRecognitionLike | null = null;
  private _state: VoiceInputState;
  private readonly listeners = new Set<Listener>();

  constructor(options: VoiceInputOptions = {}) {
    this.options = options;
    const Ctor = getSpeechRecognitionConstructor();
    this._state = Ctor ? "idle" : "unsupported";
  }

  get state(): VoiceInputState {
    return this._state;
  }

  get isSupported(): boolean {
    return this._state !== "unsupported";
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): VoiceInputState => this._state;

  startListening(): void {
    if (this._state === "unsupported" || this._state === "listening") return;

    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) {
      this.setState("unsupported");
      return;
    }

    const recognition = new Ctor();
    recognition.lang = this.options.lang ?? "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const result = event.results[event.resultIndex];
      if (!result) return;
      const alt = result[0];
      if (!alt) return;
      this.options.onResult?.({
        transcript: alt.transcript,
        confidence: alt.confidence,
        isFinal: result.isFinal,
      });
      if (result.isFinal) {
        this.setState("processing");
      }
    };

    recognition.onerror = (event) => {
      const errorType = event.error;
      if (errorType === "not-allowed") {
        this.setState("denied");
        this.options.onError?.("Microphone permission denied.");
      } else if (errorType === "no-speech") {
        this.setState("idle");
      } else {
        this.setState("error");
        this.options.onError?.(`Speech recognition error: ${errorType}`);
      }
      this.recognition = null;
    };

    recognition.onend = () => {
      if (this._state === "listening") {
        this.setState("idle");
      }
      this.recognition = null;
    };

    this.recognition = recognition;
    this.setState("listening");

    try {
      recognition.start();
    } catch {
      this.setState("error");
      this.recognition = null;
    }
  }

  stopListening(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // already stopped
      }
      this.recognition = null;
    }
    if (this._state === "listening") {
      this.setState("idle");
    }
  }

  submitText(text: string): void {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    this.setState("processing");
    this.options.onResult?.({
      transcript: trimmed,
      confidence: 1,
      isFinal: true,
    });
  }

  resetState(): void {
    this.stopListening();
    if (this._state !== "unsupported" && this._state !== "denied") {
      this.setState("idle");
    }
  }

  dispose(): void {
    this.stopListening();
    this.listeners.clear();
  }

  private setState(state: VoiceInputState): void {
    if (state === this._state) return;
    this._state = state;
    this.options.onStateChange?.(state);
    for (const listener of this.listeners) listener();
  }
}
