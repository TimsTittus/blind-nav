import type { SceneObservation } from "@/core";

/**
 * Canned observations for development and tests. They let the whole pipeline
 * and UI be exercised in each meaningful state without a camera or an API key.
 * These are deliberately conservative and never claim a precise distance.
 */
export const FIXTURE_SCENES = {
  clear: {
    sceneType: "sidewalk",
    pathStatus: "clear",
    terrain: "even",
    overallConfidence: 0.9,
    uncertainty: "low",
    obstacles: [],
    hazards: [],
    recommendedImmediateAction: "continue",
    description: "Open, even sidewalk ahead with no obstacles in view.",
  },
  puddle: {
    sceneType: "sidewalk",
    pathStatus: "partially_blocked",
    terrain: "wet",
    overallConfidence: 0.78,
    uncertainty: "low",
    obstacles: [
      {
        type: "puddle",
        position: "center",
        relativeDistance: "near",
        severity: "medium",
        confidence: 0.8,
        movement: "stationary",
        label: "puddle",
      },
    ],
    hazards: [
      {
        type: "slippery",
        severity: "medium",
        position: "center",
        confidence: 0.75,
        description: "Wet surface ahead; footing may be slippery.",
      },
    ],
    recommendedImmediateAction: "slow_down",
    description: "A puddle covers much of the path ahead.",
  },
  obstacle: {
    sceneType: "sidewalk",
    pathStatus: "partially_blocked",
    terrain: "even",
    overallConfidence: 0.82,
    uncertainty: "low",
    obstacles: [
      {
        type: "pole",
        position: "right",
        relativeDistance: "near",
        severity: "high",
        confidence: 0.85,
        movement: "stationary",
        label: "pole",
      },
      {
        type: "person",
        position: "left",
        relativeDistance: "medium",
        severity: "medium",
        confidence: 0.7,
        movement: "approaching",
      },
    ],
    hazards: [
      {
        type: "collision",
        severity: "high",
        position: "right",
        confidence: 0.8,
        description: "Pole close on the right.",
      },
    ],
    recommendedImmediateAction: "move_left",
    description:
      "A pole is close on the right; a person approaches on the left.",
  },
  stairs: {
    sceneType: "stairway",
    pathStatus: "partially_blocked",
    terrain: "steps_down",
    overallConfidence: 0.8,
    uncertainty: "low",
    obstacles: [
      {
        type: "stairs",
        position: "center",
        relativeDistance: "near",
        severity: "high",
        confidence: 0.82,
        movement: "stationary",
        label: "descending stairs",
      },
    ],
    hazards: [
      {
        type: "fall",
        severity: "critical",
        position: "center",
        confidence: 0.8,
        description: "Steps lead downward directly ahead.",
      },
    ],
    recommendedImmediateAction: "stop",
    description: "A downward staircase begins just ahead.",
  },
  blocked: {
    sceneType: "sidewalk",
    pathStatus: "blocked",
    terrain: "even",
    overallConfidence: 0.88,
    uncertainty: "low",
    obstacles: [
      {
        type: "barrier",
        position: "center",
        relativeDistance: "very_near",
        severity: "critical",
        confidence: 0.9,
        movement: "stationary",
        label: "barrier",
      },
    ],
    hazards: [
      {
        type: "collision",
        severity: "critical",
        position: "center",
        confidence: 0.9,
        description: "A barrier blocks the path directly ahead.",
      },
    ],
    recommendedImmediateAction: "stop",
    description: "A barrier blocks the path directly ahead.",
  },
  uncertain: {
    sceneType: "unknown",
    pathStatus: "unknown",
    terrain: "unknown",
    overallConfidence: 0.2,
    uncertainty: "high",
    obstacles: [],
    hazards: [],
    recommendedImmediateAction: "unknown",
    description: "The view is too dark and blurry to interpret reliably.",
  },
  // ── Phase 11 evaluation scenes ────────────────────────────────────────────
  clear_road: {
    sceneType: "roadway",
    pathStatus: "clear",
    terrain: "even",
    overallConfidence: 0.88,
    uncertainty: "low",
    obstacles: [],
    hazards: [],
    recommendedImmediateAction: "continue",
    description: "Open road surface ahead, no obstacles visible.",
  },
  pothole: {
    sceneType: "sidewalk",
    pathStatus: "partially_blocked",
    terrain: "uneven",
    overallConfidence: 0.75,
    uncertainty: "low",
    obstacles: [
      {
        type: "pothole",
        position: "center",
        relativeDistance: "near",
        severity: "high",
        confidence: 0.78,
        movement: "stationary",
        label: "pothole",
      },
    ],
    hazards: [
      {
        type: "hole",
        severity: "high",
        position: "center",
        confidence: 0.75,
        description: "A pothole in the path could cause a trip or fall.",
      },
    ],
    recommendedImmediateAction: "slow_down",
    description: "A pothole is visible directly ahead in the path.",
  },
  parked_vehicle: {
    sceneType: "sidewalk",
    pathStatus: "partially_blocked",
    terrain: "even",
    overallConfidence: 0.85,
    uncertainty: "low",
    obstacles: [
      {
        type: "vehicle",
        position: "center",
        relativeDistance: "near",
        severity: "high",
        confidence: 0.87,
        movement: "stationary",
        label: "parked car",
      },
    ],
    hazards: [
      {
        type: "collision",
        severity: "high",
        position: "center",
        confidence: 0.85,
        description: "A parked vehicle partially blocks the path ahead.",
      },
    ],
    recommendedImmediateAction: "slow_down",
    description: "A parked car blocks the centre of the path.",
  },
  moving_person: {
    sceneType: "sidewalk",
    pathStatus: "partially_blocked",
    terrain: "even",
    overallConfidence: 0.8,
    uncertainty: "low",
    obstacles: [
      {
        type: "person",
        position: "center",
        relativeDistance: "near",
        severity: "medium",
        confidence: 0.82,
        movement: "approaching",
        label: "pedestrian",
      },
    ],
    hazards: [
      {
        type: "moving_object",
        severity: "medium",
        position: "center",
        confidence: 0.78,
        description: "A person is walking directly toward you.",
      },
    ],
    recommendedImmediateAction: "slow_down",
    description: "A pedestrian is approaching head-on.",
  },
  stairs_up: {
    sceneType: "stairway",
    pathStatus: "partially_blocked",
    terrain: "steps_up",
    overallConfidence: 0.82,
    uncertainty: "low",
    obstacles: [
      {
        type: "stairs",
        position: "center",
        relativeDistance: "near",
        severity: "high",
        confidence: 0.84,
        movement: "stationary",
        label: "ascending stairs",
      },
    ],
    hazards: [
      {
        type: "step",
        severity: "high",
        position: "center",
        confidence: 0.82,
        description: "Steps lead upward directly ahead.",
      },
    ],
    recommendedImmediateAction: "stop",
    description: "An upward staircase begins just ahead.",
  },
  curb: {
    sceneType: "sidewalk",
    pathStatus: "partially_blocked",
    terrain: "curb",
    overallConfidence: 0.83,
    uncertainty: "low",
    obstacles: [
      {
        type: "curb",
        position: "center",
        relativeDistance: "near",
        severity: "medium",
        confidence: 0.85,
        movement: "stationary",
        label: "kerb drop",
      },
    ],
    hazards: [
      {
        type: "drop_off",
        severity: "medium",
        position: "center",
        confidence: 0.8,
        description: "A kerb drop is directly ahead; step down carefully.",
      },
    ],
    recommendedImmediateAction: "slow_down",
    description: "A kerb leads to a lower road surface ahead.",
  },
  wall: {
    sceneType: "indoor",
    pathStatus: "blocked",
    terrain: "even",
    overallConfidence: 0.9,
    uncertainty: "low",
    obstacles: [
      {
        type: "wall",
        position: "center",
        relativeDistance: "very_near",
        severity: "critical",
        confidence: 0.92,
        movement: "stationary",
        label: "wall",
      },
    ],
    hazards: [
      {
        type: "collision",
        severity: "critical",
        position: "center",
        confidence: 0.9,
        description: "A wall directly ahead blocks all forward movement.",
      },
    ],
    recommendedImmediateAction: "stop",
    description: "A wall is directly ahead and blocks the path.",
  },
  narrow_path: {
    sceneType: "sidewalk",
    pathStatus: "partially_blocked",
    terrain: "even",
    overallConfidence: 0.77,
    uncertainty: "medium",
    obstacles: [
      {
        type: "barrier",
        position: "left",
        relativeDistance: "near",
        severity: "medium",
        confidence: 0.75,
        movement: "stationary",
        label: "fence",
      },
      {
        type: "barrier",
        position: "right",
        relativeDistance: "near",
        severity: "medium",
        confidence: 0.75,
        movement: "stationary",
        label: "wall",
      },
    ],
    hazards: [],
    recommendedImmediateAction: "slow_down",
    description: "The path narrows significantly between two barriers.",
  },
  road_crossing: {
    sceneType: "street_crossing",
    pathStatus: "partially_blocked",
    terrain: "even",
    overallConfidence: 0.78,
    uncertainty: "medium",
    obstacles: [
      {
        type: "vehicle",
        position: "left",
        relativeDistance: "medium",
        severity: "high",
        confidence: 0.8,
        movement: "crossing",
        label: "car",
      },
    ],
    hazards: [
      {
        type: "vehicle",
        severity: "high",
        position: "left",
        confidence: 0.78,
        description:
          "A vehicle is crossing from the left; wait before proceeding.",
      },
    ],
    recommendedImmediateAction: "stop",
    description: "A road crossing with a vehicle approaching from the left.",
  },
  low_light: {
    sceneType: "unknown",
    pathStatus: "unknown",
    terrain: "unknown",
    overallConfidence: 0.25,
    uncertainty: "high",
    obstacles: [],
    hazards: [],
    recommendedImmediateAction: "unknown",
    description: "Low-light conditions; scene cannot be reliably assessed.",
  },
} satisfies Record<string, SceneObservation>;

export type FixtureSceneId = keyof typeof FIXTURE_SCENES;

export const FIXTURE_SCENE_IDS = Object.keys(
  FIXTURE_SCENES,
) as FixtureSceneId[];

export const DEFAULT_FIXTURE_SCENE: FixtureSceneId = "clear";

export function isFixtureSceneId(value: string): value is FixtureSceneId {
  return value in FIXTURE_SCENES;
}
