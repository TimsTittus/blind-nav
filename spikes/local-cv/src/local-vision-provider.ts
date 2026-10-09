/**
 * Prototype `LocalVisionProvider` implementing the production `VisionProvider`
 * interface. Spike only: runs in Node via onnxruntime-node; the browser build
 * would use onnxruntime-web (WebGPU with WASM fallback) behind the same class.
 */
import { RawImage } from "@huggingface/transformers";
import type { SceneAnalysis } from "@/core";
import { normalizeSceneObservation } from "@/providers/normalize";
import type { VisionProvider } from "@/providers/provider";
import type { AnalyzeFrameInput, AnalyzeFrameOptions } from "@/providers/types";
import { candidateByKey } from "./candidates";
import {
  answersFromDepth,
  answersFromDetection,
  answersFromSegmentation,
  detectionsInCorridor,
  fuse,
  segEvidence,
  type FastAnswers,
} from "./fast-answers";
import { toSceneObservation } from "./local-observation";
import { loadRunner, type Runner } from "./runners";

export interface LocalVisionProviderOptions {
  segmentation: string;
  detection?: string;
  depth?: string;
  threads?: number;
}

export class LocalVisionProvider implements VisionProvider {
  readonly id = "local";
  private constructor(
    private readonly seg: Runner,
    private readonly det: Runner | null,
    private readonly depth: Runner | null,
  ) {}

  static async create(
    options: LocalVisionProviderOptions,
  ): Promise<LocalVisionProvider> {
    const threads = options.threads ?? 4;
    const load = (key?: string) =>
      key ? loadRunner(candidateByKey(key), threads) : Promise.resolve(null);
    const [seg, det, depth] = await Promise.all([
      loadRunner(candidateByKey(options.segmentation), threads),
      load(options.detection),
      load(options.depth),
    ]);
    return new LocalVisionProvider(seg, det, depth);
  }

  async analyzeFrame(
    input: AnalyzeFrameInput,
    options?: AnalyzeFrameOptions,
  ): Promise<SceneAnalysis> {
    const blob = await (await fetch(input.frame.dataUrl)).blob();
    const image = await RawImage.fromBlob(blob);
    throwIfAborted(options?.signal);

    const sources: FastAnswers[] = [];
    const segOut = (await this.seg.run(image)).output;
    if (segOut.kind !== "segmentation")
      throw new Error("segmentation runner returned wrong kind");
    sources.push(answersFromSegmentation(segOut));

    let detections: ReturnType<typeof detectionsInCorridor> = [];
    if (this.det) {
      throwIfAborted(options?.signal);
      const detOut = (await this.det.run(image)).output;
      if (detOut.kind === "detection") {
        sources.push(answersFromDetection(detOut));
        detections = detectionsInCorridor(detOut);
      }
    }
    if (this.depth) {
      throwIfAborted(options?.signal);
      const depthOut = (await this.depth.run(image)).output;
      if (depthOut.kind === "depth") sources.push(answersFromDepth(depthOut));
    }
    throwIfAborted(options?.signal);

    const observation = toSceneObservation({
      answers: fuse(sources),
      seg: segEvidence(segOut),
      detections,
    });
    return normalizeSceneObservation(observation, {
      capturedAt: input.frame.capturedAt,
      provider: this.id,
    });
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted)
    throw new DOMException("The analysis was aborted.", "AbortError");
}
