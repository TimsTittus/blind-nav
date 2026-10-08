import { blobToDataUrl, type SceneQueryClient } from "@/perception";
import type { SpeechEngine } from "@/speech";
import type { CapturedFrame } from "@/camera";

export type SceneQueryState =
  "idle" | "capturing" | "querying" | "speaking" | "error";

type Listener = () => void;

export interface SceneQueryHandlerDeps {
  queryClient: SceneQueryClient;
  speechEngine: SpeechEngine;
  captureFrame: () => Promise<CapturedFrame>;
}

export class SceneQueryHandler {
  private readonly queryClient: SceneQueryClient;
  private readonly speechEngine: SpeechEngine;
  private readonly captureFrame: () => Promise<CapturedFrame>;

  private _state: SceneQueryState = "idle";
  private _lastAnswer: string | null = null;
  private _lastError: string | null = null;
  private abortController: AbortController | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(deps: SceneQueryHandlerDeps) {
    this.queryClient = deps.queryClient;
    this.speechEngine = deps.speechEngine;
    this.captureFrame = deps.captureFrame;
  }

  get state(): SceneQueryState {
    return this._state;
  }

  get lastAnswer(): string | null {
    return this._lastAnswer;
  }

  get lastError(): string | null {
    return this._lastError;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SceneQuerySnapshot => ({
    state: this._state,
    lastAnswer: this._lastAnswer,
    lastError: this._lastError,
  });

  async submitQuestion(question: string): Promise<void> {
    if (this._state === "querying" || this._state === "capturing") {
      this.abortController?.abort();
    }

    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    this._lastError = null;

    this.setState("capturing");

    let dataUrl: string;
    let capturedAt: number;
    try {
      const frame = await this.captureFrame();
      dataUrl = await blobToDataUrl(frame.blob);
      capturedAt = frame.capturedAt;
    } catch {
      if (signal.aborted) return;
      this._lastError = "Could not capture a camera frame.";
      this.setState("error");
      return;
    }

    if (signal.aborted) return;
    this.setState("querying");

    try {
      const response = await this.queryClient.query({
        dataUrl,
        capturedAt,
        question,
        signal,
      });

      if (signal.aborted) return;

      if (response.ok) {
        this._lastAnswer = response.answer;
        this.setState("speaking");
        this.speechEngine.speak(response.answer, "information");
        this.setState("idle");
      } else {
        this._lastError = response.error.message;
        this.setState("error");
      }
    } catch (error) {
      if (signal.aborted) return;
      this._lastError =
        error instanceof Error ? error.message : "Query failed.";
      this.setState("error");
    }
  }

  cancel(): void {
    this.abortController?.abort();
    this.abortController = null;
    if (this._state !== "idle") {
      this.setState("idle");
    }
  }

  dispose(): void {
    this.cancel();
    this.listeners.clear();
  }

  private setState(state: SceneQueryState): void {
    if (state === this._state) return;
    this._state = state;
    for (const listener of this.listeners) listener();
  }
}

export interface SceneQuerySnapshot {
  readonly state: SceneQueryState;
  readonly lastAnswer: string | null;
  readonly lastError: string | null;
}
