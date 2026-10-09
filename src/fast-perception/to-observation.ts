/**
 * Normalized fast perception → the shared `SceneObservation` contract, under a
 * {@link FastTrustPolicy}.
 *
 * This is the one place local evidence becomes something the Safety Engine can
 * read, so the conservative rules live here:
 * - **Never** `pathStatus: "clear"`. No local evidence means `"unknown"`.
 * - **Never** fills `recommendedImmediateAction` — the Safety Engine decides.
 * - **Never** reports terrain: a class grid cannot see wet ground, a curb, or
 *   which way a step goes.
 * - Distances are the coarse image bands from `grid.ts`, never meters.
 * - Confidence is capped by the policy and `uncertainty` is never `"low"`.
 */
import type {
  FastBand,
  FastObstacle,
  FastObstacleType,
  FastPerceptionFrame,
  Obstacle,
  ObstacleType,
  PathStatus,
  RelativeDistance,
  SceneObservation,
  SceneType,
} from "@/core";
import { mayEscalate, type FastTrustPolicy } from "./trust-policy";

const FAST_TO_OBSTACLE: Record<FastObstacleType, ObstacleType> = {
  person: "person",
  vehicle: "vehicle",
  cyclist: "cyclist",
  animal: "animal",
  pole: "pole",
  wall: "wall",
  barrier: "barrier",
  stairs: "stairs",
  door: "door",
  water: "puddle",
  other: "other",
  unknown: "unknown",
};

/**
 * Bands map to the middle of the distance scale. `very_near` is never claimed:
 * without depth, "low in frame" does not justify "about to collide".
 */
const BAND_TO_DISTANCE: Record<FastBand, RelativeDistance> = {
  near: "near",
  mid: "medium",
  far: "far",
};

function toObstacle(fast: FastObstacle): Obstacle {
  return {
    type: FAST_TO_OBSTACLE[fast.type],
    position: fast.region.lateral,
    relativeDistance: BAND_TO_DISTANCE[fast.region.band],
    severity: fast.type === "stairs" ? "high" : "medium",
    confidence: fast.confidence,
    movement: fast.movement,
  };
}

/**
 * Resolve `pathStatus` from the escalatable answers only. The ceiling is
 * `partially_blocked` unless the policy explicitly allows a `blocked`
 * assertion, because Phase 13 measured `blocked` at precision 0.13.
 */
function resolvePathStatus(
  frame: FastPerceptionFrame,
  policy: FastTrustPolicy,
): PathStatus {
  const { answers } = frame;

  if (
    policy.allowBlockedAssertion &&
    mayEscalate(policy, "blocked") &&
    answers.blocked === true
  ) {
    return "blocked";
  }

  const raisesRisk =
    (mayEscalate(policy, "somethingAhead") &&
      answers.somethingAhead === true) ||
    (mayEscalate(policy, "stairs") && answers.stairs === true) ||
    (mayEscalate(policy, "largeObstacle") && answers.largeObstacle === true) ||
    (mayEscalate(policy, "blocked") && answers.blocked === true);

  // Absence of evidence is "unknown", never "clear".
  return raisesRisk ? "partially_blocked" : "unknown";
}

/**
 * `sidewalk` is reported as scene *type* only, which carries no risk claim.
 * It never affects `pathStatus`.
 */
function resolveSceneType(
  frame: FastPerceptionFrame,
  policy: FastTrustPolicy,
): SceneType {
  if (mayEscalate(policy, "stairs") && frame.answers.stairs === true) {
    return "stairway";
  }
  if (frame.answers.sidewalk === true) return "sidewalk";
  return "unknown";
}

export function toSceneObservation(
  frame: FastPerceptionFrame,
  policy: FastTrustPolicy,
): SceneObservation {
  const pathStatus = resolvePathStatus(frame, policy);
  const stairsTrusted =
    mayEscalate(policy, "stairs") && frame.answers.stairs === true;

  const obstacles = frame.obstacles
    .filter((o) => o.type !== "stairs" || stairsTrusted)
    .map(toObstacle)
    .slice(0, 20);

  const findings = [
    pathStatus === "blocked" ? "path appears blocked" : null,
    stairsTrusted ? "stairs detected" : null,
    mayEscalate(policy, "largeObstacle") && frame.answers.largeObstacle === true
      ? "large object ahead"
      : pathStatus === "partially_blocked"
        ? "object ahead"
        : null,
  ].filter((f): f is string => f !== null);

  return {
    sceneType: resolveSceneType(frame, policy),
    pathStatus,
    terrain: "unknown",
    overallConfidence: policy.maxConfidence,
    uncertainty: "medium",
    obstacles,
    hazards: stairsTrusted
      ? [
          {
            type: "step",
            severity: "high",
            position: "center",
            confidence: Math.min(0.5, policy.maxConfidence),
            description: "Stairs detected ahead (direction unknown).",
          },
        ]
      : [],
    recommendedImmediateAction: "unknown",
    description:
      findings.length > 0
        ? `Local check: ${findings.join(", ")}.`
        : "Local check found no clear hazard; this does not confirm the path is clear.",
  };
}
