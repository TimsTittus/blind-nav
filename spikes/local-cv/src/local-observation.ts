/**
 * Maps local fast answers into the shared `SceneObservation` contract.
 *
 * Rules (the local model must not make claims it cannot support):
 * - Never reports `pathStatus: "clear"`. Absence of evidence is `"unknown"`.
 * - Never fills `recommendedImmediateAction` (always `"unknown"`): the Safety
 *   Engine decides.
 * - Never reports terrain (wet, curb, slope, step direction): it cannot tell.
 * - Distances are coarse image-position categories, never meters.
 * - Confidence is capped and uncertainty is never `"low"`.
 */
import type {
  Obstacle,
  ObstacleType,
  ObstaclePosition,
  RelativeDistance,
  SceneObservation,
} from "@/core";
import type { FastAnswers, SegEvidence } from "./fast-answers";
import type { Detection } from "./raw-output";

export const LOCAL_MAX_CONFIDENCE = 0.6;

export interface LocalEvidence {
  answers: FastAnswers;
  seg: SegEvidence | null;
  /** Detections already filtered to the walking corridor. */
  detections: Detection[];
}

const COCO_TO_OBSTACLE: Record<string, ObstacleType> = {
  person: "person",
  car: "vehicle",
  truck: "vehicle",
  bus: "vehicle",
  motorcycle: "vehicle",
  train: "vehicle",
  bicycle: "cyclist",
  dog: "animal",
  cat: "animal",
  horse: "animal",
  cow: "animal",
  "fire hydrant": "pole",
  "parking meter": "pole",
  "stop sign": "pole",
  bench: "barrier",
};

const ADE_TO_OBSTACLE: Record<string, ObstacleType> = {
  wall: "wall",
  building: "wall",
  house: "wall",
  fence: "barrier",
  railing: "barrier",
  pole: "pole",
  streetlight: "pole",
  column: "pole",
  signboard: "pole",
  person: "person",
  car: "vehicle",
  truck: "vehicle",
  van: "vehicle",
  bus: "vehicle",
  bicycle: "cyclist",
  minibike: "vehicle",
  door: "door",
  water: "puddle",
};

function positionOf(d: Detection): ObstaclePosition {
  const cx = (d.box.x0 + d.box.x1) / 2;
  return cx < 0.4 ? "left" : cx > 0.6 ? "right" : "center";
}

/** Coarse category from how low the object's base sits in the frame. */
function distanceFromBase(base: number): RelativeDistance {
  if (base >= 0.85) return "very_near";
  if (base >= 0.65) return "near";
  if (base >= 0.45) return "medium";
  return "far";
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function toSceneObservation(e: LocalEvidence): SceneObservation {
  const { answers, seg } = e;
  const obstacles: Obstacle[] = [];

  for (const d of e.detections.slice(0, 10)) {
    const large = d.box.y1 - d.box.y0 >= 0.25;
    obstacles.push({
      type: COCO_TO_OBSTACLE[d.label] ?? "other",
      position: positionOf(d),
      relativeDistance: distanceFromBase(d.box.y1),
      severity: large ? "high" : "medium",
      confidence: round(Math.min(d.score, LOCAL_MAX_CONFIDENCE)),
      movement: "unknown",
      label: d.label.slice(0, 60),
    });
  }

  if (
    seg &&
    answers.somethingAhead &&
    seg.dominantObstacle &&
    seg.nearestObstacleRow !== null
  ) {
    obstacles.push({
      type: ADE_TO_OBSTACLE[seg.dominantObstacle] ?? "unknown",
      position: "center",
      relativeDistance: distanceFromBase((seg.nearestObstacleRow + 1) / 24),
      severity: answers.blocked
        ? "high"
        : answers.largeObstacle
          ? "medium"
          : "low",
      confidence: round(
        Math.min(0.2 + seg.obstacleAhead, LOCAL_MAX_CONFIDENCE),
      ),
      movement: "unknown",
      label: seg.dominantObstacle.slice(0, 60),
    });
  }

  if (answers.stairs) {
    obstacles.push({
      type: "stairs",
      position: "center",
      relativeDistance: "near",
      severity: "high",
      confidence: round(
        Math.min(0.3 + (seg?.stairsAhead ?? 0), LOCAL_MAX_CONFIDENCE),
      ),
      movement: "stationary",
      label: "stairs",
    });
  }

  const pathStatus: SceneObservation["pathStatus"] = answers.blocked
    ? "blocked"
    : answers.somethingAhead || answers.stairs
      ? "partially_blocked"
      : "unknown";

  const sceneType: SceneObservation["sceneType"] = answers.stairs
    ? "stairway"
    : answers.sidewalk
      ? "sidewalk"
      : "unknown";

  const findings = [
    answers.blocked ? "path appears blocked" : null,
    answers.stairs ? "stairs detected" : null,
    answers.largeObstacle
      ? "large object ahead"
      : !answers.blocked && answers.somethingAhead
        ? "object ahead"
        : null,
  ].filter(Boolean);

  return {
    sceneType,
    pathStatus,
    terrain: "unknown",
    overallConfidence: LOCAL_MAX_CONFIDENCE,
    uncertainty: "medium",
    obstacles: obstacles.slice(0, 20),
    hazards: answers.stairs
      ? [
          {
            type: "step",
            severity: "high",
            position: "center",
            confidence: 0.5,
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
