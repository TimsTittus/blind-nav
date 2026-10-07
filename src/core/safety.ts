import { z } from "zod";
import { EpochMillisSchema, NonEmptyStringSchema } from "./primitives";

export const SafetyLevelSchema = z.enum([
  "clear",
  "caution",
  "stop",
  "unknown",
]);

export const SafetyAssessmentSchema = z.object({
  level: SafetyLevelSchema,
  reasons: z.array(NonEmptyStringSchema),
  basedOnAnalysisId: NonEmptyStringSchema.optional(),
  assessedAt: EpochMillisSchema,
  degraded: z.boolean(),
});

export type SafetyLevel = z.infer<typeof SafetyLevelSchema>;
export type SafetyAssessment = z.infer<typeof SafetyAssessmentSchema>;
