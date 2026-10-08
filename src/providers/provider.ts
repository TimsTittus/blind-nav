import type { SceneAnalysis } from "@/core";
import type {
  AnalyzeFrameInput,
  AnalyzeFrameOptions,
  SceneQueryInput,
  SceneQueryResult,
} from "./types";

export interface VisionProvider {
  readonly id: string;

  analyzeFrame(
    input: AnalyzeFrameInput,
    options?: AnalyzeFrameOptions,
  ): Promise<SceneAnalysis>;

  queryScene?(
    input: SceneQueryInput,
    options?: AnalyzeFrameOptions,
  ): Promise<SceneQueryResult>;
}
