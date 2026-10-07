import { z } from "zod";
import {
  type SceneAnalysis,
  SceneAnalysisSchema,
  SerializedAppErrorSchema,
} from "@/core";
import { AnalyzeFrameContextSchema, FrameInputSchema } from "@/providers";

/**
 * Wire contract between the browser and `POST /api/vision/analyze`. Defined
 * without importing any provider SDK so both client and server can share it.
 */

export const AnalyzeRequestSchema = z.object({
  frame: FrameInputSchema,
  context: AnalyzeFrameContextSchema.optional(),
  /**
   * Monotonic client sequence number for the frame. Echoed back so the client
   * can discard a response that a newer frame has already superseded.
   */
  sequence: z.number().int().min(0),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const AnalyzeSuccessSchema = z.object({
  ok: z.literal(true),
  sequence: z.number().int().min(0),
  analysis: SceneAnalysisSchema,
  /** Server round-trip latency for the analysis, in milliseconds. */
  latencyMs: z.number().min(0),
});

export const AnalyzeFailureSchema = z.object({
  ok: z.literal(false),
  sequence: z.number().int().min(0),
  error: SerializedAppErrorSchema,
  /**
   * On any failure, perception is explicitly unavailable — never a silent
   * "path clear". Downstream code must treat this as "we do not know".
   */
  perceptionStatus: z.literal("unavailable"),
});

export const AnalyzeResponseSchema = z.discriminatedUnion("ok", [
  AnalyzeSuccessSchema,
  AnalyzeFailureSchema,
]);

export type AnalyzeSuccess = z.infer<typeof AnalyzeSuccessSchema>;
export type AnalyzeFailure = z.infer<typeof AnalyzeFailureSchema>;
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

export function isAnalyzeSuccess(
  response: AnalyzeResponse,
): response is AnalyzeSuccess {
  return response.ok;
}

export type { SceneAnalysis };
