import { z } from "zod";
import {
  EpochMillisSchema,
  HeadingStateSchema,
  LocationStateSchema,
  SessionModeSchema,
} from "@/core";

export const FrameInputSchema = z.object({
  dataUrl: z.string().startsWith("data:"),
  width: z.number().int().min(1).optional(),
  height: z.number().int().min(1).optional(),
  capturedAt: EpochMillisSchema,
});

export const AnalyzeFrameContextSchema = z.object({
  mode: SessionModeSchema,
  heading: HeadingStateSchema.optional(),
  location: LocationStateSchema.optional(),
  /**
   * Development-only hint naming a fixture scene to return. Ignored by the real
   * Gemini provider; honoured only by the fixture provider in non-production.
   */
  scenario: z.string().min(1).optional(),
});

export const AnalyzeFrameInputSchema = z.object({
  frame: FrameInputSchema,
  context: AnalyzeFrameContextSchema.optional(),
});

export type FrameInput = z.infer<typeof FrameInputSchema>;
export type AnalyzeFrameContext = z.infer<typeof AnalyzeFrameContextSchema>;
export type AnalyzeFrameInput = z.infer<typeof AnalyzeFrameInputSchema>;

export interface AnalyzeFrameOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}
