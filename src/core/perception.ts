import { z } from "zod";
import {
  ConfidenceSchema,
  EpochMillisSchema,
  MetersSchema,
  NonEmptyStringSchema,
} from "./primitives";

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

export const ObstacleDirectionSchema = z.enum([
  "left",
  "center-left",
  "center",
  "center-right",
  "right",
]);

export const ObstacleProximitySchema = z.enum(["immediate", "near", "far"]);

export const ObstacleKindSchema = z.enum([
  "person",
  "vehicle",
  "cyclist",
  "animal",
  "pole",
  "wall",
  "door",
  "stairs",
  "curb",
  "step",
  "hole",
  "overhang",
  "surface-change",
  "other",
]);

export const ObstacleSchema = z.object({
  id: NonEmptyStringSchema,
  kind: ObstacleKindSchema,
  label: NonEmptyStringSchema.optional(),
  confidence: ConfidenceSchema,
  direction: ObstacleDirectionSchema.optional(),
  proximity: ObstacleProximitySchema.optional(),
  distanceMeters: MetersSchema.optional(),
  moving: z.boolean().optional(),
});

export const TraversabilitySchema = z.enum([
  "clear",
  "partially-blocked",
  "blocked",
  "unknown",
]);

export const SceneAnalysisSchema = z.object({
  analysisId: NonEmptyStringSchema,
  capturedAt: EpochMillisSchema,
  availability: PerceptionAvailabilitySchema,
  overallConfidence: ConfidenceSchema,
  obstacles: z.array(ObstacleSchema),
  traversability: TraversabilitySchema,
  description: NonEmptyStringSchema.optional(),
  provider: NonEmptyStringSchema.optional(),
});

export type PerceptionAvailability = z.infer<
  typeof PerceptionAvailabilitySchema
>;
export type PerceptionStatus = z.infer<typeof PerceptionStatusSchema>;
export type ObstacleDirection = z.infer<typeof ObstacleDirectionSchema>;
export type ObstacleProximity = z.infer<typeof ObstacleProximitySchema>;
export type ObstacleKind = z.infer<typeof ObstacleKindSchema>;
export type Obstacle = z.infer<typeof ObstacleSchema>;
export type Traversability = z.infer<typeof TraversabilitySchema>;
export type SceneAnalysis = z.infer<typeof SceneAnalysisSchema>;
