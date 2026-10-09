/**
 * `HybridVisionProvider` — cloud semantic understanding plus local fast
 * perception, reconciled by the fusion layer.
 *
 * This is the interface-level composition the Phase 14 brief asks for, and the
 * third arm of the cloud-only / local-only / hybrid comparison. It is **not**
 * the real-time path: in a live session the two sources run at different
 * frequencies on their own loops and are fused by the session controller, so
 * the cloud is never blocked waiting for the local model or vice versa. Here
 * both run against the same single frame, which is what makes the comparison
 * fair.
 *
 * The cloud provider is injected rather than imported so this file stays free
 * of the Gemini SDK (and therefore of the API key).
 */
import type { SceneAnalysis } from "@/core";
import {
  CONSERVATIVE_TRUST_POLICY,
  type FastTrustPolicy,
} from "@/fast-perception";
import {
  fusePerception,
  type FusedPerception,
  type FusionConfig,
} from "@/fusion";
import type { LocalVisionProvider } from "../local";
import type { VisionProvider } from "../provider";
import type { AnalyzeFrameInput, AnalyzeFrameOptions } from "../types";

export interface HybridVisionProviderOptions {
  cloud: VisionProvider;
  local: LocalVisionProvider;
  policy?: FastTrustPolicy;
  fusionConfig?: Partial<FusionConfig>;
  now?: () => number;
  /** Called with the full fusion record, including conflicts, after each frame. */
  onFused?: (fused: FusedPerception) => void;
}

export class HybridVisionProvider implements VisionProvider {
  readonly id = "hybrid";

  private readonly cloud: VisionProvider;
  private readonly local: LocalVisionProvider;
  private readonly policy: FastTrustPolicy;
  private readonly fusionConfig: Partial<FusionConfig>;
  private readonly now: () => number;
  private readonly onFused: ((fused: FusedPerception) => void) | undefined;

  constructor(options: HybridVisionProviderOptions) {
    this.cloud = options.cloud;
    this.local = options.local;
    this.policy = options.policy ?? CONSERVATIVE_TRUST_POLICY;
    this.fusionConfig = options.fusionConfig ?? {};
    this.now = options.now ?? Date.now;
    this.onFused = options.onFused;
  }

  /**
   * Both sources are attempted; neither failing takes the other down. A failed
   * cloud call degrades to local-only (the brief's warning-state case) and a
   * failed local inference degrades to cloud-only — never to "clear".
   */
  async analyzeFrame(
    input: AnalyzeFrameInput,
    options?: AnalyzeFrameOptions,
  ): Promise<SceneAnalysis> {
    const [cloudResult, localResult] = await Promise.allSettled([
      this.cloud.analyzeFrame(input, options),
      this.local.perceive(input, options),
    ]);

    const fused = fusePerception({
      cloud: cloudResult.status === "fulfilled" ? cloudResult.value : null,
      local: localResult.status === "fulfilled" ? localResult.value : null,
      policy: this.policy,
      now: this.now(),
      config: this.fusionConfig,
    });
    this.onFused?.(fused);

    if (fused.analysis) return fused.analysis;

    // Neither source produced usable evidence. Surface the cloud's failure if
    // there was one, rather than inventing an "all clear".
    if (cloudResult.status === "rejected") throw cloudResult.reason;
    if (localResult.status === "rejected") throw localResult.reason;
    throw new Error("No perception source produced a usable result.");
  }
}
