import type { FastQuestion, SceneAnalysis } from "@/core";

export type PerceptionSourceKind = "cloud" | "local";

/** Per-source metadata the fusion decision is made from. */
export interface PerceptionSourceInfo {
  readonly source: PerceptionSourceKind;
  /** Provider or model that produced it. */
  readonly id: string;
  /** Whether this source contributed evidence to the merged result. */
  readonly contributed: boolean;
  /** Age at fusion time (ms), or null when the source produced nothing. */
  readonly ageMs: number | null;
  /** The source's own confidence, or null when it produced nothing. */
  readonly confidence: number | null;
  /** Fresh enough to be used as evidence. */
  readonly fresh: boolean;
}

/**
 * A disagreement between the two sources on one question, kept rather than
 * silently resolved. `resolution` records what the merge did, which is always
 * "took the more cautious reading" — never "trusted the cloud" or "trusted the
 * local model".
 */
export interface PerceptionConflict {
  readonly question: FastQuestion | "pathStatus";
  readonly cloud: string;
  readonly local: string;
  readonly resolution: "took_more_cautious";
}

/** Why the merged result ended up as it did. */
export type FusionMode =
  /** Both sources fresh and used. */
  | "hybrid"
  /** Cloud only: no local evidence. */
  | "cloud_only"
  /** Local only: cloud missing or stale — the brief's warning-state case. */
  | "local_only"
  /** Neither source usable. */
  | "none";

export interface FusedPerception {
  /** Merged, validated scene, or null when neither source could contribute. */
  readonly analysis: SceneAnalysis | null;
  readonly mode: FusionMode;
  readonly sources: readonly PerceptionSourceInfo[];
  readonly conflicts: readonly PerceptionConflict[];
  readonly fusedAt: number;
}
