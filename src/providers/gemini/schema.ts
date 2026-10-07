import { type Schema, Type } from "@google/genai";

/**
 * Structured-output schema handed to Gemini. It mirrors `SceneObservationSchema`
 * in `@/core` (the model-output subset — no server-assigned identity/freshness).
 * The model's JSON is still re-validated with Zod on return; this schema just
 * makes well-formed output the default path.
 */

const stringEnum = (values: string[], description: string): Schema => ({
  type: Type.STRING,
  enum: values,
  description,
});

const confidence: Schema = {
  type: Type.NUMBER,
  description: "Confidence from 0 (guess) to 1 (certain).",
};

const obstacle: Schema = {
  type: Type.OBJECT,
  properties: {
    type: stringEnum(
      [
        "person",
        "vehicle",
        "cyclist",
        "animal",
        "pole",
        "wall",
        "door",
        "stairs",
        "curb",
        "pothole",
        "puddle",
        "barrier",
        "overhang",
        "surface_change",
        "other",
        "unknown",
      ],
      "What the obstacle is.",
    ),
    position: stringEnum(
      ["left", "center", "right", "unknown"],
      "Lateral position relative to the direction of travel.",
    ),
    relativeDistance: stringEnum(
      ["very_near", "near", "medium", "far", "unknown"],
      "Relative distance category. NEVER estimate meters.",
    ),
    severity: stringEnum(
      ["low", "medium", "high", "critical", "unknown"],
      "How dangerous this obstacle is to a walking pedestrian.",
    ),
    confidence,
    movement: stringEnum(
      ["stationary", "approaching", "receding", "crossing", "unknown"],
      "Apparent motion relative to the user.",
    ),
    label: {
      type: Type.STRING,
      description: "Optional short label (<=60 chars). Omit if unsure.",
    },
  },
  required: [
    "type",
    "position",
    "relativeDistance",
    "severity",
    "confidence",
    "movement",
  ],
  propertyOrdering: [
    "type",
    "position",
    "relativeDistance",
    "severity",
    "confidence",
    "movement",
    "label",
  ],
};

const hazard: Schema = {
  type: Type.OBJECT,
  properties: {
    type: stringEnum(
      [
        "collision",
        "trip",
        "fall",
        "drop_off",
        "overhead",
        "vehicle",
        "slippery",
        "hole",
        "step",
        "moving_object",
        "other",
        "unknown",
      ],
      "The kind of collision or fall hazard.",
    ),
    severity: stringEnum(
      ["low", "medium", "high", "critical", "unknown"],
      "How dangerous the hazard is.",
    ),
    position: stringEnum(
      ["left", "center", "right", "unknown"],
      "Where the hazard is relative to the direction of travel.",
    ),
    confidence,
    description: {
      type: Type.STRING,
      description: "Optional short note (<=120 chars).",
    },
  },
  required: ["type", "severity", "position", "confidence"],
  propertyOrdering: [
    "type",
    "severity",
    "position",
    "confidence",
    "description",
  ],
};

/** The `responseSchema` passed to `generateContent`. */
export const GEMINI_SCENE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    sceneType: stringEnum(
      [
        "indoor",
        "sidewalk",
        "street_crossing",
        "roadway",
        "stairway",
        "doorway",
        "open_area",
        "unknown",
      ],
      "Coarse categorisation of the surroundings.",
    ),
    pathStatus: stringEnum(
      ["clear", "partially_blocked", "blocked", "unknown"],
      "Whether the traversable area straight ahead is passable.",
    ),
    terrain: stringEnum(
      [
        "even",
        "uneven",
        "steps_up",
        "steps_down",
        "slope",
        "curb",
        "wet",
        "unknown",
      ],
      "Character of the ground directly ahead.",
    ),
    overallConfidence: {
      type: Type.NUMBER,
      description: "Overall confidence in this analysis, 0 to 1.",
    },
    uncertainty: stringEnum(
      ["low", "medium", "high"],
      "How much to distrust this analysis overall.",
    ),
    obstacles: {
      type: Type.ARRAY,
      items: obstacle,
      description:
        "Immediate obstacles in the traversable area. [] if none seen.",
    },
    hazards: {
      type: Type.ARRAY,
      items: hazard,
      description: "Potential collision or fall hazards. [] if none seen.",
    },
    recommendedImmediateAction: stringEnum(
      ["continue", "slow_down", "move_left", "move_right", "stop", "unknown"],
      "A hint only — NOT a command. Use unknown when unsure.",
    ),
    description: {
      type: Type.STRING,
      description: "One short caption (<=240 chars). Not a long narration.",
    },
  },
  required: [
    "sceneType",
    "pathStatus",
    "terrain",
    "overallConfidence",
    "uncertainty",
    "obstacles",
    "hazards",
    "recommendedImmediateAction",
    "description",
  ],
  propertyOrdering: [
    "sceneType",
    "pathStatus",
    "terrain",
    "overallConfidence",
    "uncertainty",
    "obstacles",
    "hazards",
    "recommendedImmediateAction",
    "description",
  ],
};
