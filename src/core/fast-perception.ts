import { z } from "zod";
import {
  ConfidenceSchema,
  EpochMillisSchema,
  NonEmptyStringSchema,
} from "./primitives";

/**
 * Normalized **fast perception** contract (Phase 14).
 *
 * This is the only shape local computer-vision output is allowed to take once
 * it leaves the model. Model-specific structures (ONNX tensors, class-index
 * grids, COCO boxes, ADE20K label names) stay inside the
 * `fast-perception` layer and must never reach `safety`, `decision` or `app`.
 *
 * It deliberately answers *less* than {@link SceneObservationSchema}:
 * - Six yes/no questions about the walking corridor, each **tri-state**, where
 *   `null` means "this model cannot say" — never "no".
 * - Coarse image **regions**, never meters and never pixel boxes.
 * - No scene narration, no recommended action, no terrain. A local model that
 *   cannot see wetness or step direction must not imply it can.
 */

/** What a local model can plausibly recognise. Narrower than `ObstacleType`. */
export const FastObstacleTypeSchema = z.enum([
  "person",
  "vehicle",
  "cyclist",
  "animal",
  "pole",
  "wall",
  "barrier",
  "stairs",
  "door",
  "water",
  "other",
  "unknown",
]);

/** Lateral third of the walking corridor. */
export const FastLateralSchema = z.enum(["left", "center", "right"]);

/**
 * Coarse depth band derived from how low the object sits in the frame.
 * An image-space ordering, not a distance: `near` is lower in frame than `far`.
 */
export const FastBandSchema = z.enum(["near", "mid", "far"]);

export const FastRegionSchema = z.object({
  lateral: FastLateralSchema,
  band: FastBandSchema,
});

/** Local models get one frame at a time, so movement is usually unknowable. */
export const FastMovementSchema = z.enum([
  "stationary",
  "approaching",
  "receding",
  "crossing",
  "unknown",
]);

/**
 * The normalized obstacle record from the brief: type, region, confidence,
 * movement. No label text, no box, no distance.
 */
export const FastObstacleSchema = z.object({
  type: FastObstacleTypeSchema,
  region: FastRegionSchema,
  confidence: ConfidenceSchema,
  movement: FastMovementSchema,
});

/**
 * Tri-state answer. `null` is a first-class value meaning "no answer from this
 * source", which is never interpreted as `false` downstream.
 */
export const FastAnswerSchema = z.boolean().nullable();

/** The six fast questions, in the order the Phase 13 brief lists them. */
export const FastAnswersSchema = z.object({
  /** Is there something directly ahead? */
  somethingAhead: FastAnswerSchema,
  /** Is the walking area blocked? */
  blocked: FastAnswerSchema,
  /** Is there a sidewalk? */
  sidewalk: FastAnswerSchema,
  /** Is there a staircase? */
  stairs: FastAnswerSchema,
  /** Is there a large obstacle? */
  largeObstacle: FastAnswerSchema,
  /** Is the path traversable? */
  traversable: FastAnswerSchema,
});

/** Why fast perception has (or has not) produced a usable frame. */
export const FastPerceptionAvailabilitySchema = z.enum([
  "ok",
  /** Ran, but every answer was `null`. */
  "ambiguous",
  /** Not configured, no model, or unsupported runtime. */
  "unavailable",
  /** Inference threw. */
  "error",
]);

/**
 * One completed local inference. `producedAt - capturedAt` is the real
 * end-to-end age the fusion layer reasons about; `inferenceMs` is model time
 * only.
 */
export const FastPerceptionFrameSchema = z.object({
  /** Monotonic per controller; lets consumers drop stale results. */
  sequence: z.number().int().min(0),
  capturedAt: EpochMillisSchema,
  producedAt: EpochMillisSchema,
  availability: FastPerceptionAvailabilitySchema,
  answers: FastAnswersSchema,
  obstacles: z.array(FastObstacleSchema).max(20),
  /** Model time in ms, excluding capture and encoding. */
  inferenceMs: z.number().min(0),
  /** Which backend ran it, e.g. "onnx-webgpu", "onnx-wasm", "recorded". */
  backend: NonEmptyStringSchema,
  /** Which weights produced it, e.g. "seaformer-s-ade-384". */
  modelId: NonEmptyStringSchema,
});

export type FastObstacleType = z.infer<typeof FastObstacleTypeSchema>;
export type FastLateral = z.infer<typeof FastLateralSchema>;
export type FastBand = z.infer<typeof FastBandSchema>;
export type FastRegion = z.infer<typeof FastRegionSchema>;
export type FastMovement = z.infer<typeof FastMovementSchema>;
export type FastObstacle = z.infer<typeof FastObstacleSchema>;
export type FastAnswer = z.infer<typeof FastAnswerSchema>;
export type FastAnswers = z.infer<typeof FastAnswersSchema>;
export type FastPerceptionAvailability = z.infer<
  typeof FastPerceptionAvailabilitySchema
>;
export type FastPerceptionFrame = z.infer<typeof FastPerceptionFrameSchema>;

/** The six question keys, for iteration. */
export const FAST_QUESTIONS = [
  "somethingAhead",
  "blocked",
  "sidewalk",
  "stairs",
  "largeObstacle",
  "traversable",
] as const satisfies readonly (keyof FastAnswers)[];

export type FastQuestion = (typeof FAST_QUESTIONS)[number];

/** No source could answer anything. */
export const NO_FAST_ANSWERS: FastAnswers = {
  somethingAhead: null,
  blocked: null,
  sidewalk: null,
  stairs: null,
  largeObstacle: null,
  traversable: null,
};
