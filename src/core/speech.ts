import { z } from "zod";
import { DecisionKindSchema, PrioritySchema } from "./decision";
import {
  EpochMillisSchema,
  NonEmptyStringSchema,
  UuidSchema,
} from "./primitives";

export const SpeechInstructionSchema = z.object({
  id: UuidSchema,
  text: NonEmptyStringSchema,
  priority: PrioritySchema,
  interrupt: z.boolean(),
  createdAt: EpochMillisSchema,
  decisionKind: DecisionKindSchema.optional(),
});

export type SpeechInstruction = z.infer<typeof SpeechInstructionSchema>;
