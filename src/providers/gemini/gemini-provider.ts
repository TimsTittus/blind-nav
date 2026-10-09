import { GoogleGenAI } from "@google/genai";
import {
  InvalidImageError,
  InvalidModelResponseError,
  type SceneAnalysis,
  SceneObservationSchema,
} from "@/core";
import { invalidModelResponse, mapProviderError } from "../errors";
import { normalizeSceneObservation } from "../normalize";
import type { VisionProvider } from "../provider";
import type {
  AnalyzeFrameInput,
  AnalyzeFrameOptions,
  SceneQueryInput,
  SceneQueryResult,
} from "../types";
import { GEMINI_SCENE_SCHEMA } from "./schema";
import {
  buildGeminiPrompt,
  buildGeminiQueryPrompt,
  GEMINI_QUERY_SYSTEM_INSTRUCTION,
  GEMINI_SYSTEM_INSTRUCTION,
} from "./prompt";

/** Default per-request budget. A navigation frame is worthless if it is late. */
export const DEFAULT_GEMINI_TIMEOUT_MS = 8000;

/**
 * The slice of the `@google/genai` client this provider actually uses. Narrowed
 * so tests can inject a fake without constructing a real `GoogleGenAI`.
 */
export interface GeminiModels {
  generateContent(params: {
    model: string;
    contents: unknown;
    config?: unknown;
  }): Promise<{ text?: string | undefined }>;
}

export interface GeminiProviderOptions {
  model: string;
  /** Inject a client/models stub in tests; otherwise a real client is built. */
  models?: GeminiModels;
  apiKey?: string;
  timeoutMs?: number;
}

const DATA_URL_RE = /^data:([^;,]+)(;base64)?,(.*)$/s;

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match || !match[2]) {
    throw new InvalidImageError("Expected a base64 data URL for the frame.");
  }
  return {
    mimeType: match[1] ?? "application/octet-stream",
    data: match[3] ?? "",
  };
}

/**
 * Google Gemini vision provider. Server-only: it holds the API key and must
 * never be imported into client/browser code. Output is validated with Zod and
 * normalized into the shared Scene Representation; failures become typed errors.
 */
export class GeminiVisionProvider implements VisionProvider {
  readonly id = "gemini";
  private readonly models: GeminiModels;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: GeminiProviderOptions) {
    this.model = options.model;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_GEMINI_TIMEOUT_MS;
    this.models =
      options.models ??
      new GoogleGenAI(
        options.apiKey !== undefined ? { apiKey: options.apiKey } : {},
      ).models;
  }

  async analyzeFrame(
    input: AnalyzeFrameInput,
    options?: AnalyzeFrameOptions,
  ): Promise<SceneAnalysis> {
    const { mimeType, data } = parseDataUrl(input.frame.dataUrl);
    const timeout = withTimeout(
      options?.signal,
      options?.timeoutMs ?? this.timeoutMs,
    );

    let text: string | undefined;
    try {
      const response = await this.models.generateContent({
        model: this.model,
        contents: [
          { text: buildGeminiPrompt(input.context) },
          { inlineData: { mimeType, data } },
        ],
        config: {
          systemInstruction: GEMINI_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: GEMINI_SCENE_SCHEMA,
          // Deterministic-leaning and fast: this is observation, not prose.
          temperature: 0,
          thinkingConfig: { thinkingBudget: 0 },
          abortSignal: timeout.signal,
        },
      });
      text = response.text;
    } catch (error) {
      throw mapProviderError(error);
    } finally {
      timeout.clear();
    }

    if (!text || text.trim() === "") {
      throw new InvalidModelResponseError(
        "The model returned an empty response.",
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      throw new InvalidModelResponseError(
        "The model did not return valid JSON.",
        { cause: error },
      );
    }

    const parsed = SceneObservationSchema.safeParse(json);
    if (!parsed.success) {
      throw invalidModelResponse(parsed.error);
    }

    return normalizeSceneObservation(parsed.data, {
      capturedAt: input.frame.capturedAt,
      provider: this.id,
    });
  }

  async queryScene(
    input: SceneQueryInput,
    options?: AnalyzeFrameOptions,
  ): Promise<SceneQueryResult> {
    const { mimeType, data } = parseDataUrl(input.frame.dataUrl);
    const timeout = withTimeout(
      options?.signal,
      options?.timeoutMs ?? this.timeoutMs,
    );

    let text: string | undefined;
    try {
      const response = await this.models.generateContent({
        model: this.model,
        contents: [
          { text: buildGeminiQueryPrompt(input.question) },
          { inlineData: { mimeType, data } },
        ],
        config: {
          systemInstruction: GEMINI_QUERY_SYSTEM_INSTRUCTION,
          temperature: 0,
          thinkingConfig: { thinkingBudget: 0 },
          abortSignal: timeout.signal,
        },
      });
      text = response.text;
    } catch (error) {
      throw mapProviderError(error);
    } finally {
      timeout.clear();
    }

    if (!text || text.trim() === "") {
      throw new InvalidModelResponseError(
        "The model returned an empty response.",
      );
    }

    return {
      answer: text.trim(),
      queriedAt: Date.now(),
      provider: this.id,
    };
  }
}

/**
 * Combine an optional caller signal with a timeout. The returned `clear` stops
 * the timer so a completed request does not leak a pending timeout.
 */
function withTimeout(
  external: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error("timeout")),
    timeoutMs,
  );
  const onAbort = () => controller.abort(external?.reason);
  if (external) {
    if (external.aborted) controller.abort(external.reason);
    else external.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", onAbort);
    },
  };
}
