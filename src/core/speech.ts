import { z } from "zod";
import { DecisionKindSchema } from "./decision";
import {
  EpochMillisSchema,
  NonEmptyStringSchema,
  UuidSchema,
} from "./primitives";

export const SpeechPrioritySchema = z.enum([
  "critical",
  "high",
  "navigation",
  "information",
  "low",
]);

export type SpeechPriority = z.infer<typeof SpeechPrioritySchema>;

export const SpeechInstructionSchema = z.object({
  id: UuidSchema,
  text: NonEmptyStringSchema,
  priority: SpeechPrioritySchema,
  interrupt: z.boolean(),
  createdAt: EpochMillisSchema,
  decisionKind: DecisionKindSchema.optional(),
});

export type SpeechInstruction = z.infer<typeof SpeechInstructionSchema>;
