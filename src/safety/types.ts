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

export interface SafetyContext {
  readonly sceneAnalysis: SceneAnalysis | null;
  readonly location: LocationState | null;
  readonly heading: HeadingState | null;
  readonly route: Route | null;
  readonly currentRouteStep: RouteStep | null;
  readonly now: EpochMillis;
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
