/**
 * Reconciles cloud semantic understanding with local fast perception.
 *
 *   camera ─┬─ LocalVisionProvider  → FastPerception    (5–15 FPS target)
 *           └─ GeminiVisionProvider → SceneUnderstanding (0.5–2 FPS)
 *                      │
 *                      ▼
 *            fusePerception(...)  ──►  Safety Engine
 *
 * Rules, in order of importance:
 *
 * 1. **Neither source automatically wins.** Freshness decides whether a source
 *    is admissible evidence at all; where both are admissible and disagree, the
 *    *more cautious* reading is taken and the disagreement is recorded in
 *    `conflicts` rather than discarded.
 * 2. **Local evidence can only add risk.** It may add obstacles and hazards and
 *    worsen `pathStatus`, but never improves it, never deletes a cloud finding,
 *    and never lowers uncertainty or raises confidence.
 * 3. **Absence is never "clear".** A missing or stale cloud result falls back to
 *    local evidence, whose own absence of findings is `"unknown"`. When neither
 *    source is admissible the result is `null`, which the Safety Engine already
 *    treats as `unknown`/degraded.
 * 4. **The merged result never carries a recommended action from the local
 *    model**, and the Safety Engine remains the only component that decides
 *    risk.
 */
import type {
  FastPerceptionFrame,
  PathStatus,
  SceneAnalysis,
  SceneObservation,
  Uncertainty,
} from "@/core";
import { toSceneObservation, type FastTrustPolicy } from "@/fast-perception";
import { normalizeSceneObservation } from "@/providers";
import { FUSION_CONFIG, type FusionConfig } from "./config";
import type {
  FusedPerception,
  FusionMode,
  PerceptionConflict,
  PerceptionSourceInfo,
} from "./types";

/** Higher is more cautious. */
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

export interface FusePerceptionInput {
  readonly cloud: SceneAnalysis | null;
  readonly local: FastPerceptionFrame | null;
  readonly policy: FastTrustPolicy;
  readonly now: number;
  readonly config?: Partial<FusionConfig>;
  /** Injectable for deterministic tests. */
  readonly analysisId?: () => string;
}

export function fusePerception(input: FusePerceptionInput): FusedPerception {
  const config = { ...FUSION_CONFIG, ...input.config };
  const { cloud, local, now } = input;

  const cloudAgeMs = cloud ? Math.max(0, now - cloud.analyzedAt) : null;
  const localAgeMs = local ? Math.max(0, now - local.producedAt) : null;

  const cloudUsable =
    cloud !== null &&
    cloudAgeMs !== null &&
    cloudAgeMs <= config.cloudFreshMs &&
    cloud.availability !== "error" &&
    cloud.availability !== "unavailable";

  const localUsable =
    local !== null &&
    localAgeMs !== null &&
    localAgeMs <= config.localFreshMs &&
    local.availability === "ok";

  const localObservation = localUsable
    ? toSceneObservation(local, input.policy)
    : null;

  const conflicts: PerceptionConflict[] =
    cloudUsable && cloud !== null && localObservation && local !== null
      ? findConflicts(cloud, localObservation, local)
      : [];

  const mode: FusionMode =
    cloudUsable && localObservation
      ? "hybrid"
      : cloudUsable
        ? "cloud_only"
        : localObservation
          ? "local_only"
          : "none";

  const sources: PerceptionSourceInfo[] = [
    {
      source: "cloud",
      id: cloud?.provider ?? "none",
      contributed: cloudUsable,
      ageMs: cloudAgeMs,
      confidence: cloud?.overallConfidence ?? null,
      fresh: cloudUsable,
    },
    {
      source: "local",
      id: local?.modelId ?? "none",
      contributed: localUsable,
      ageMs: localAgeMs,
      confidence: localUsable ? input.policy.maxConfidence : null,
      fresh: localUsable,
    },
  ];

  const analysis = buildAnalysis({
    mode,
    cloud: cloudUsable ? cloud : null,
    local: localObservation,
    now,
    ...(input.analysisId ? { analysisId: input.analysisId } : {}),
  });

  return { analysis, mode, sources, conflicts, fusedAt: now };
}

function buildAnalysis(args: {
  mode: FusionMode;
  cloud: SceneAnalysis | null;
  local: SceneObservation | null;
  now: number;
  analysisId?: () => string;
}): SceneAnalysis | null {
  const { cloud, local, now } = args;

  if (cloud && local) {
    const merged = mergeObservations(cloud, local);
    // Restamped through the same boundary every provider goes through, so the
    // merged scene is validated rather than assembled by hand.
    return normalizeSceneObservation(merged, {
      capturedAt: cloud.capturedAt,
      provider: "hybrid",
      now: () => now,
      ...(args.analysisId ? { analysisId: args.analysisId } : {}),
    });
  }

  if (cloud) return cloud;

  if (local) {
    return normalizeSceneObservation(local, {
      capturedAt: now,
      provider: "local",
      now: () => now,
      ...(args.analysisId ? { analysisId: args.analysisId } : {}),
    });
  }

  return null;
}

/**
 * Cloud scene plus local evidence. Only risk-increasing fields move; the
 * cloud's description, terrain, scene type and recommended action are kept,
 * because those are the claims the local model is not entitled to make.
 */
function mergeObservations(
  cloud: SceneAnalysis,
  local: SceneObservation,
): SceneObservation {
  const localHasEvidence = local.pathStatus !== "unknown";

  return {
    sceneType: cloud.sceneType,
    pathStatus: worsePath(cloud.pathStatus, local.pathStatus),
    terrain: cloud.terrain,
    overallConfidence: localHasEvidence
      ? Math.min(cloud.overallConfidence, local.overallConfidence)
      : cloud.overallConfidence,
    uncertainty: localHasEvidence
      ? moreUncertain(cloud.uncertainty, local.uncertainty)
      : cloud.uncertainty,
    obstacles: [...cloud.obstacles, ...local.obstacles].slice(0, 20),
    hazards: [...cloud.hazards, ...local.hazards].slice(0, 20),
    recommendedImmediateAction: cloud.recommendedImmediateAction,
    description: cloud.description,
  };
}

/** Local `unknown` means "no evidence" and must not move the cloud either way. */
function worsePath(cloud: PathStatus, local: PathStatus): PathStatus {
  if (local === "unknown") return cloud;
  return PATH_RISK[local] > PATH_RISK[cloud] ? local : cloud;
}

function moreUncertain(cloud: Uncertainty, local: Uncertainty): Uncertainty {
  return UNCERTAINTY_RANK[local] > UNCERTAINTY_RANK[cloud] ? local : cloud;
}

/**
 * Explicit disagreement, recorded whether or not it changed the outcome. The
 * Safety Engine uses the presence of conflict to degrade its assessment.
 */
function findConflicts(
  cloud: SceneAnalysis,
  localObservation: SceneObservation,
  localFrame: FastPerceptionFrame,
): PerceptionConflict[] {
  const conflicts: PerceptionConflict[] = [];

  if (
    localObservation.pathStatus !== "unknown" &&
    localObservation.pathStatus !== cloud.pathStatus
  ) {
    conflicts.push({
      question: "pathStatus",
      cloud: cloud.pathStatus,
      local: localObservation.pathStatus,
      resolution: "took_more_cautious",
    });
  }

  // Stairs are the local model's strongest signal, so a cloud scene with no
  // step hazard while local sees stairs is worth surfacing on its own.
  const cloudSeesSteps =
    cloud.terrain === "steps_up" ||
    cloud.terrain === "steps_down" ||
    cloud.obstacles.some((o) => o.type === "stairs") ||
    cloud.hazards.some((h) => h.type === "step" || h.type === "fall");

  if (localFrame.answers.stairs === true && !cloudSeesSteps) {
    conflicts.push({
      question: "stairs",
      cloud: "no stairs reported",
      local: "stairs detected",
      resolution: "took_more_cautious",
    });
  }

  return conflicts;
}
