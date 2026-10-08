import { z } from "zod";
import {
  ConfidenceSchema,
  EpochMillisSchema,
  NonEmptyStringSchema,
} from "./primitives";

export const SafetyLevelSchema = z.enum([
  "unknown",
  "safe",
  "caution",
  "danger",
  "critical",
]);

export const SafetyActionSchema = z.enum([
  "none",
  "continue",
  "continue_cautiously",
  "slow_down",
  "move_left",
  "move_right",
  "stop",
]);

export const SafetyAssessmentSchema = z.object({
  level: SafetyLevelSchema,
  action: SafetyActionSchema,
  reasons: z.array(NonEmptyStringSchema),
  confidence: ConfidenceSchema,
  basedOnAnalysisId: NonEmptyStringSchema.optional(),
  assessedAt: EpochMillisSchema,
  expiresAt: EpochMillisSchema,
  degraded: z.boolean(),
});

export type SafetyLevel = z.infer<typeof SafetyLevelSchema>;
export type SafetyAction = z.infer<typeof SafetyActionSchema>;
export type SafetyAssessment = z.infer<typeof SafetyAssessmentSchema>;
