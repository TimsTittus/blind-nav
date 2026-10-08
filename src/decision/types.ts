import type { CameraState } from "@/camera";
import type { PerceptionState } from "@/perception";
import type { SafetyAssessment } from "@/core";
import type { LocationSnapshot } from "@/navigation";
import type { RouteTrackerState } from "@/navigation";
import type { SceneQuerySnapshot } from "./scene-query-handler";

/** How fresh the most recent AI analysis is. */
export type PerceptionFreshness = "fresh" | "aging" | "stale" | "none";

/** High-level lifecycle of the orchestration session. */
export type SessionPhase =
  "idle" | "starting" | "running" | "paused" | "stopping" | "stopped" | "error";

/** Immutable snapshot the UI observes via useSyncExternalStore. */
export interface SessionControllerSnapshot {
  readonly phase: SessionPhase;
  readonly camera: CameraState;
  readonly perception: PerceptionState;
  readonly perceptionFreshness: PerceptionFreshness;
  readonly safety: SafetyAssessment;
  readonly location: LocationSnapshot;
  readonly route: RouteTrackerState;
  readonly lastError: string | null;
  readonly stats: SessionStats;
  readonly query: SceneQuerySnapshot;
}

export interface SessionStats {
  readonly fps: number;
  readonly aiRequestCount: number;
  readonly aiLatencyMs: number | null;
  readonly lastAnalysisAt: number | null;
  readonly lastSpeechAt: number | null;
}
