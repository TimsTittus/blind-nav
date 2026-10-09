import type {
  EpochMillis,
  HeadingState,
  LocationState,
  Route,
  RouteStep,
  SafetyAction,
  SafetyLevel,
  SceneAnalysis,
} from "@/core";

/**
 * What the Safety Engine needs to know about how the scene it was handed was
 * assembled from multiple perception sources.
 *
 * Deliberately a flat, minimal shape rather than the fusion layer's own types:
 * `safety` stays independent of how perception is produced, and the engine
 * never needs to know that local computer vision exists.
 */
export interface PerceptionFusionInput {
  /** Only local (fast) evidence was admissible — the cloud is absent or stale. */
  readonly localOnly: boolean;
  /** Human-readable disagreements between sources; empty when they agree. */
  readonly conflicts: readonly string[];
}

export interface SafetyContext {
  readonly sceneAnalysis: SceneAnalysis | null;
  readonly location: LocationState | null;
  readonly heading: HeadingState | null;
  readonly route: Route | null;
  readonly currentRouteStep: RouteStep | null;
  readonly now: EpochMillis;
  /** Absent when the scene came from a single source. */
  readonly fusion?: PerceptionFusionInput;
}

export interface ThreatSignal {
  readonly level: SafetyLevel;
  readonly action: SafetyAction;
  readonly reason: string;
  readonly confidence: number;
}

export interface FusionOverride {
  readonly suppressedInstruction: string;
  readonly reason: string;
}
