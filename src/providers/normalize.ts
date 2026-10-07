import {
  type PerceptionAvailability,
  type SceneAnalysis,
  SceneAnalysisSchema,
  type SceneObservation,
} from "@/core";

export interface NormalizeOptions {
  /** Frame timestamp echoed from the request. */
  capturedAt: number;
  /** Provider id recorded on the analysis (e.g. "gemini", "fixture"). */
  provider: string;
  /** Overrides `Date.now()`; injectable for deterministic tests. */
  now?: () => number;
  /** Overrides UUID generation; injectable for deterministic tests. */
  analysisId?: () => string;
}

/** At or below this overall confidence the scene is treated as ambiguous. */
export const AMBIGUOUS_CONFIDENCE_THRESHOLD = 0.35;

/**
 * Derive the overall availability from the model's self-reported uncertainty
 * and confidence. We never upgrade a shaky observation to a confident "ok":
 * high uncertainty or low confidence surfaces as `ambiguous` so downstream
 * layers can tell "looks clear" apart from "we are not sure".
 */
export function deriveAvailability(
  observation: SceneObservation,
): PerceptionAvailability {
  if (
    observation.uncertainty === "high" ||
    observation.overallConfidence <= AMBIGUOUS_CONFIDENCE_THRESHOLD
  ) {
    return "ambiguous";
  }
  return "ok";
}

/**
 * Turn a validated provider observation into a validated, normalized
 * {@link SceneAnalysis} by adding server-assigned identity and freshness. The
 * result is parsed through Zod again so every provider's output goes through
 * the exact same boundary.
 */
export function normalizeSceneObservation(
  observation: SceneObservation,
  options: NormalizeOptions,
): SceneAnalysis {
  const now = options.now ?? Date.now;
  const makeId = options.analysisId ?? (() => crypto.randomUUID());
  return SceneAnalysisSchema.parse({
    ...observation,
    analysisId: makeId(),
    capturedAt: options.capturedAt,
    analyzedAt: now(),
    availability: deriveAvailability(observation),
    provider: options.provider,
  });
}
