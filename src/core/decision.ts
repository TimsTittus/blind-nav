import { z } from "zod";
import { EpochMillisSchema, NonEmptyStringSchema } from "./primitives";
import { SafetyAssessmentSchema } from "./safety";

export const PrioritySchema = z.enum(["low", "normal", "high", "critical"]);

export const DecisionKindSchema = z.enum([
  "continue",
  "caution",
  "stop",
  "reroute",
  "arrived",
  "idle",
  "unavailable",
]);

export const NavigationDecisionSchema = z.object({
  kind: DecisionKindSchema,
  safety: SafetyAssessmentSchema,
  message: NonEmptyStringSchema,
  priority: PrioritySchema,
  decidedAt: EpochMillisSchema,
  sourceStepId: NonEmptyStringSchema.optional(),
});

export type Priority = z.infer<typeof PrioritySchema>;
export type DecisionKind = z.infer<typeof DecisionKindSchema>;
export type NavigationDecision = z.infer<typeof NavigationDecisionSchema>;
