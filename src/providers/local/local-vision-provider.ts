/**
 * `LocalVisionProvider` — local computer vision behind the same
 * {@link VisionProvider} interface as Gemini.
 *
 * **Client-only.** Unlike `GeminiVisionProvider`, which holds a key and runs in
 * a route handler, this provider runs in the browser tab and must never be
 * constructed on the server.
 *
 * It exists so the local model is usable anywhere a `VisionProvider` is
 * expected — the evaluation harness, a cloud-free mode, the hybrid provider.
 * The real-time path does **not** go through it: `FastPerceptionController`
 * talks to the backend directly, because this interface takes a base64 data
 * URL and decoding one per frame would cost more than the inference.
 */
import type { FastPerceptionFrame, SceneAnalysis } from "@/core";
import { FastPerceptionFrameSchema, NO_FAST_ANSWERS } from "@/core";
import {
  CONSERVATIVE_TRUST_POLICY,
  readSegmentation,
  toSceneObservation,
  type FastTrustPolicy,
  type LocalVisionBackend,
  type RgbaFrame,
} from "@/fast-perception";
import { normalizeSceneObservation } from "../normalize";
import type { VisionProvider } from "../provider";
import type { AnalyzeFrameInput, AnalyzeFrameOptions } from "../types";

/** Decodes a data URL to RGBA at the backend's input size. */
export type FrameDecoder = (
  dataUrl: string,
  size: number,
  signal?: AbortSignal,
) => Promise<RgbaFrame>;

export interface LocalVisionProviderOptions {
  backend: LocalVisionBackend;
  policy?: FastTrustPolicy;
  decodeFrame?: FrameDecoder;
  now?: () => number;
}

export class LocalVisionProvider implements VisionProvider {
  readonly id = "local";

  private readonly backend: LocalVisionBackend;
  private readonly policy: FastTrustPolicy;
  private readonly decodeFrame: FrameDecoder;
  private readonly now: () => number;
  private sequence = 0;

  constructor(options: LocalVisionProviderOptions) {
    this.backend = options.backend;
    this.policy = options.policy ?? CONSERVATIVE_TRUST_POLICY;
    this.decodeFrame = options.decodeFrame ?? decodeViaImageBitmap;
    this.now = options.now ?? Date.now;
  }

  /** The normalized frame behind the last `analyzeFrame`, for fusion/debug. */
  async perceive(
    input: AnalyzeFrameInput,
    options?: AnalyzeFrameOptions,
  ): Promise<FastPerceptionFrame> {
    const pixels = await this.decodeFrame(
      input.frame.dataUrl,
      this.backend.inputSize,
      options?.signal,
    );
    const result = await this.backend.infer(pixels, options?.signal);
    const reading = readSegmentation(
      result.segmentation,
      this.policy.maxConfidence,
    );
    const answered = Object.values(reading.answers).some((a) => a !== null);

    return FastPerceptionFrameSchema.parse({
      sequence: this.sequence++,
      capturedAt: input.frame.capturedAt,
      producedAt: this.now(),
      availability: answered ? "ok" : "ambiguous",
      answers: answered ? reading.answers : NO_FAST_ANSWERS,
      obstacles: reading.obstacles,
      inferenceMs: result.inferenceMs,
      backend: this.backend.id,
      modelId: this.backend.modelId,
    } satisfies FastPerceptionFrame);
  }

  async analyzeFrame(
    input: AnalyzeFrameInput,
    options?: AnalyzeFrameOptions,
  ): Promise<SceneAnalysis> {
    const frame = await this.perceive(input, options);
    return normalizeSceneObservation(toSceneObservation(frame, this.policy), {
      capturedAt: input.frame.capturedAt,
      provider: this.id,
      now: this.now,
    });
  }

  dispose(): void {
    this.backend.dispose();
  }
}

/**
 * Browser decode path. Centre-crops to a square before scaling, matching
 * `FastFrameSource` so the corridor geometry means the same thing on both
 * paths.
 */
async function decodeViaImageBitmap(
  dataUrl: string,
  size: number,
  signal?: AbortSignal,
): Promise<RgbaFrame> {
  const response = await fetch(dataUrl, signal ? { signal } : {});
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas is unavailable.");
    const edge = Math.min(bitmap.width, bitmap.height);
    context.drawImage(
      bitmap,
      (bitmap.width - edge) / 2,
      (bitmap.height - edge) / 2,
      edge,
      edge,
      0,
      0,
      size,
      size,
    );
    const { data } = context.getImageData(0, 0, size, size);
    return { data, width: size, height: size, capturedAt: Date.now() };
  } finally {
    bitmap.close();
  }
}
