import type {
  PerceptionAvailability,
  SceneAnalysis,
  SerializedAppError,
} from "@/core";

/**
 * Snapshot of the perception pipeline. `status` is always honest: it starts
 * `unavailable` and only becomes `ok`/`ambiguous` from a fresh, applied
 * analysis. A failure forces it back to `unavailable` — never a silent "clear".
 */
export interface PerceptionState {
  status: PerceptionAvailability;
  analysis: SceneAnalysis | null;
  /** Sequence of the most recently *applied* result; -1 before any. */
  appliedSequence: number;
  lastError: SerializedAppError | null;
  latencyMs: number | null;
  inFlight: boolean;
  lastUpdatedAt: number | null;
}

export const INITIAL_PERCEPTION_STATE: PerceptionState = {
  status: "unavailable",
  analysis: null,
  appliedSequence: -1,
  lastError: null,
  latencyMs: null,
  inFlight: false,
  lastUpdatedAt: null,
};

/**
 * Apply a successful analysis, enforcing the no-stale-overwrite rule: a result
 * whose sequence is older than the one already applied is dropped so an old AI
 * response can never clobber a newer frame's state.
 */
export function applyAnalysis(
  state: PerceptionState,
  sequence: number,
  analysis: SceneAnalysis,
  latencyMs: number | null,
): PerceptionState {
  if (sequence < state.appliedSequence) return state;
  return {
    ...state,
    status: analysis.availability,
    analysis,
    appliedSequence: sequence,
    lastError: null,
    latencyMs,
    lastUpdatedAt: analysis.analyzedAt,
  };
}

/**
 * Apply a failure. Perception becomes `unavailable` and the last analysis is
 * cleared so nothing downstream can mistake stale data for a confirmed path.
 * An out-of-date failure (older than an applied success) is dropped.
 */
export function applyFailure(
  state: PerceptionState,
  sequence: number,
  error: SerializedAppError,
  at: number,
): PerceptionState {
  if (sequence < state.appliedSequence) return state;
  return {
    ...state,
    status: "unavailable",
    analysis: null,
    appliedSequence: sequence,
    lastError: error,
    lastUpdatedAt: at,
  };
}
