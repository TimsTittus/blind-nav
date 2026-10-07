import { z } from "zod";
import {
  ConfidenceSchema,
  EpochMillisSchema,
  NonEmptyStringSchema,
  UuidSchema,
} from "./primitives";

/**
 * Perception domain model (the "Scene Representation").
 *
 * This is the validated contract between the perception layer (which may use an
 * LLM) and the rest of the system. Everything here only *describes* the world;
 * nothing here decides what the user should do. In particular
 * `recommendedImmediateAction` is a perception *hint* from the model — the
 * deterministic Safety Engine (a later phase), not this field, decides risk and
 * what, if anything, is spoken to the user.
 *
 * Design rules baked into the schema:
 * - Categorical enums wherever possible; unknown is always representable.
 * - **No precise physical distance.** The system has no depth sensor, so
 *   obstacles carry a relative-distance *category*, never a meter value.
 * - Uncertainty is first-class (`availability`, `uncertainty`, per-item
 *   `confidence`). Absence of a reported obstacle is never a safety guarantee.
 */

/** Availability of perception as a whole — distinguishes "clear" from "unknown". */
export const PerceptionAvailabilitySchema = z.enum([
  "ok",
  "stale",
  "unavailable",
  "ambiguous",
  "error",
]);

export const PerceptionStatusSchema = z.object({
  availability: PerceptionAvailabilitySchema,
  lastUpdatedAt: EpochMillisSchema.optional(),
  detail: NonEmptyStringSchema.optional(),
});

/** Coarse categorisation of the surroundings. */
export const SceneTypeSchema = z.enum([
  "indoor",
  "sidewalk",
  "street_crossing",
  "roadway",
  "stairway",
  "doorway",
  "open_area",
  "unknown",
]);

/** Can the user keep moving forward along the intended path? */
export const PathStatusSchema = z.enum([
  "clear",
  "partially_blocked",
  "blocked",
  "unknown",
]);

/** Ground/surface character directly ahead. */
export const TerrainSchema = z.enum([
  "even",
  "uneven",
  "steps_up",
  "steps_down",
  "slope",
  "curb",
  "wet",
  "unknown",
]);

/** Lateral position relative to the user's direction of travel. */
export const ObstaclePositionSchema = z.enum([
  "left",
  "center",
  "right",
  "unknown",
]);

/**
 * Relative distance category. Deliberately coarse: the system has no depth
 * information, so it must never claim a precise distance in meters.
 */
export const RelativeDistanceSchema = z.enum([
  "very_near",
  "near",
  "medium",
  "far",
  "unknown",
]);

export const SeveritySchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
  "unknown",
]);

export const MovementSchema = z.enum([
  "stationary",
  "approaching",
  "receding",
  "crossing",
  "unknown",
]);

export const ObstacleTypeSchema = z.enum([
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
]);

export const HazardTypeSchema = z.enum([
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
]);

/**
 * A model *hint*, not a command. The Safety Engine (future phase) owns the
 * actual decision; downstream code must not wire this straight to the user.
 */
export const RecommendedActionSchema = z.enum([
  "continue",
  "slow_down",
  "move_left",
  "move_right",
  "stop",
  "unknown",
]);

/** How much to distrust this observation overall. Complements `confidence`. */
export const UncertaintySchema = z.enum(["low", "medium", "high"]);

export const ObstacleSchema = z.object({
  type: ObstacleTypeSchema,
  position: ObstaclePositionSchema,
  relativeDistance: RelativeDistanceSchema,
  severity: SeveritySchema,
  confidence: ConfidenceSchema,
  movement: MovementSchema,
  /** Optional short label (e.g. "dog", "bollard"); never a long description. */
  label: z.string().min(1).max(60).optional(),
});

export const HazardSchema = z.object({
  type: HazardTypeSchema,
  severity: SeveritySchema,
  position: ObstaclePositionSchema,
  confidence: ConfidenceSchema,
  /** Optional short note explaining the hazard; kept brief. */
  description: z.string().min(1).max(120).optional(),
});

/**
 * Exactly what a vision provider (model) is asked to produce. The server adds
 * identity/freshness metadata on top to form a {@link SceneAnalysisSchema}.
 */
export const SceneObservationSchema = z.object({
  sceneType: SceneTypeSchema,
  pathStatus: PathStatusSchema,
  terrain: TerrainSchema,
  overallConfidence: ConfidenceSchema,
  uncertainty: UncertaintySchema,
  obstacles: z.array(ObstacleSchema).max(20),
  hazards: z.array(HazardSchema).max(20),
  recommendedImmediateAction: RecommendedActionSchema,
  /** Brief caption only — not a long natural-language scene description. */
  description: z.string().max(240),
});

/**
 * A validated, normalized scene: a provider observation plus server-assigned
 * identity and freshness. This is what the analyze endpoint returns and what
 * downstream layers consume.
 */
export const SceneAnalysisSchema = SceneObservationSchema.extend({
  /** Server-generated; lets Safety reference the exact analysis it used. */
  analysisId: UuidSchema,
  /** Frame timestamp (`Date.now()` at capture), echoed from the request. */
  capturedAt: EpochMillisSchema,
  /** When the server produced this analysis. */
  analyzedAt: EpochMillisSchema,
  /** Derived availability (e.g. `ambiguous` when the model is very unsure). */
  availability: PerceptionAvailabilitySchema,
  /** Which provider produced it (e.g. "gemini", "fixture"). */
  provider: NonEmptyStringSchema,
});

export type PerceptionAvailability = z.infer<
  typeof PerceptionAvailabilitySchema
>;
export type PerceptionStatus = z.infer<typeof PerceptionStatusSchema>;
export type SceneType = z.infer<typeof SceneTypeSchema>;
export type PathStatus = z.infer<typeof PathStatusSchema>;
export type Terrain = z.infer<typeof TerrainSchema>;
export type ObstaclePosition = z.infer<typeof ObstaclePositionSchema>;
export type RelativeDistance = z.infer<typeof RelativeDistanceSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type Movement = z.infer<typeof MovementSchema>;
export type ObstacleType = z.infer<typeof ObstacleTypeSchema>;
export type HazardType = z.infer<typeof HazardTypeSchema>;
export type RecommendedAction = z.infer<typeof RecommendedActionSchema>;
export type Uncertainty = z.infer<typeof UncertaintySchema>;
export type Obstacle = z.infer<typeof ObstacleSchema>;
export type Hazard = z.infer<typeof HazardSchema>;
export type SceneObservation = z.infer<typeof SceneObservationSchema>;
export type SceneAnalysis = z.infer<typeof SceneAnalysisSchema>;
