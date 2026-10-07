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
} satisfies Record<string, SceneObservation>;

export type FixtureSceneId = keyof typeof FIXTURE_SCENES;

export const FIXTURE_SCENE_IDS = Object.keys(
  FIXTURE_SCENES,
) as FixtureSceneId[];

export const DEFAULT_FIXTURE_SCENE: FixtureSceneId = "clear";

export function isFixtureSceneId(value: string): value is FixtureSceneId {
  return value in FIXTURE_SCENES;
}
