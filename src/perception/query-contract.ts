import { z } from "zod";
import { SerializedAppErrorSchema } from "@/core";
import { FrameInputSchema } from "@/providers";

export const SceneQueryRequestSchema = z.object({
  frame: FrameInputSchema,
  question: z.string().min(1).max(500),
});
export type SceneQueryRequest = z.infer<typeof SceneQueryRequestSchema>;

export const SceneQuerySuccessSchema = z.object({
  ok: z.literal(true),
  answer: z.string().min(1),
  queriedAt: z.number(),
  latencyMs: z.number().min(0),
});

export const SceneQueryFailureSchema = z.object({
  ok: z.literal(false),
  error: SerializedAppErrorSchema,
});

export const SceneQueryResponseSchema = z.discriminatedUnion("ok", [
  SceneQuerySuccessSchema,
  SceneQueryFailureSchema,
]);

export type SceneQuerySuccess = z.infer<typeof SceneQuerySuccessSchema>;
export type SceneQueryFailure = z.infer<typeof SceneQueryFailureSchema>;
export type SceneQueryResponse = z.infer<typeof SceneQueryResponseSchema>;

export function isSceneQuerySuccess(
  response: SceneQueryResponse,
): response is SceneQuerySuccess {
  return response.ok;
}
