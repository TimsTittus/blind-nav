import type { CameraState } from "@/camera";
import type { FastPerceptionState } from "@/fast-perception";
import type { FusedPerception } from "@/fusion";
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
  /** Local fast perception. `availability: "unavailable"` when not running. */
  readonly fastPerception: FastPerceptionState;
  /** How the scene handed to the Safety Engine was assembled. */
  readonly fusion: FusedPerception | null;
  /** Why local perception is not running, when it is not. */
  readonly fastPerceptionError: string | null;
}

export interface SessionStats {
  readonly fps: number;
  readonly aiRequestCount: number;
  readonly aiLatencyMs: number | null;
  readonly lastAnalysisAt: number | null;
  readonly lastSpeechAt: number | null;
  /** Completed local inferences this session. */
  readonly localInferenceCount: number;
  /** Last local model time (ms). */
  readonly localLatencyMs: number | null;
}
