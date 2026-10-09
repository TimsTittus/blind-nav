/**
 * Prototype merge policy for a future `HybridVisionProvider`:
 *
 *   camera ─┬─ local fast perception (every frame it can afford)
 *           └─ cloud semantic reasoning (throttled)
 *                    │
 *                    ▼
 *              merged observation ──► Safety Engine
 *
 * Invariants:
 * - Local evidence can only ADD risk: it adds obstacles/hazards and can worsen
 *   `pathStatus`, but never improves it, never removes cloud findings, and
 *   never lowers uncertainty.
 * - A stale or missing cloud result is not treated as "clear": the merged
 *   observation falls back to the local one, whose own absence of evidence is
 *   `"unknown"`.
 * - The merged `recommendedImmediateAction` comes from the cloud only when the
 *   cloud result is fresh; otherwise `"unknown"`.
 */
import type { PathStatus, SceneObservation, Uncertainty } from "@/core";

export const CLOUD_FRESH_MS = 3_000;

const PATH_RISK: Record<PathStatus, number> = {
  clear: 0,
  unknown: 1,
  partially_blocked: 2,
  blocked: 3,
};
const UNCERTAINTY_RANK: Record<Uncertainty, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function worsePath(cloud: PathStatus, local: PathStatus): PathStatus {
  // Local "unknown" means "no evidence", which must not downgrade or upgrade the cloud.
  if (local === "unknown") return cloud;
  return PATH_RISK[local] > PATH_RISK[cloud] ? local : cloud;
}

export function mergeObservations(
  cloud: SceneObservation | null,
  cloudAgeMs: number,
  local: SceneObservation,
): SceneObservation {
  if (!cloud || cloudAgeMs > CLOUD_FRESH_MS) return local;

  const uncertainty =
    UNCERTAINTY_RANK[local.uncertainty] > UNCERTAINTY_RANK[cloud.uncertainty] &&
    local.pathStatus !== "unknown"
      ? local.uncertainty
      : cloud.uncertainty;

  return {
    ...cloud,
    pathStatus: worsePath(cloud.pathStatus, local.pathStatus),
    uncertainty,
    obstacles: [...cloud.obstacles, ...local.obstacles].slice(0, 20),
    hazards: [...cloud.hazards, ...local.hazards].slice(0, 20),
    overallConfidence: Math.min(
      cloud.overallConfidence,
      local.pathStatus === "unknown" ? 1 : local.overallConfidence,
    ),
    description: cloud.description,
  };
}
