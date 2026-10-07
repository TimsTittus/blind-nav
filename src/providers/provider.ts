import type { SceneAnalysis } from "@/core";
import type { AnalyzeFrameInput, AnalyzeFrameOptions } from "./types";

export interface VisionProvider {
  readonly id: string;

  analyzeFrame(
    input: AnalyzeFrameInput,
    options?: AnalyzeFrameOptions,
  ): Promise<SceneAnalysis>;
}
