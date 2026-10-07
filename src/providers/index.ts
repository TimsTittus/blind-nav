export type { VisionProvider } from "./provider";
export * from "./types";
export {
  AiProviderError,
  InvalidImageError,
  InvalidModelResponseError,
  NetworkError,
  RateLimitedError,
  TimeoutError,
  invalidImage,
  invalidModelResponse,
  mapProviderError,
} from "./errors";
export {
  AMBIGUOUS_CONFIDENCE_THRESHOLD,
  deriveAvailability,
  normalizeSceneObservation,
} from "./normalize";
export type { NormalizeOptions } from "./normalize";
// The fixture provider is pure (no SDK, no secrets) and safe to import anywhere.
export {
  DEFAULT_FIXTURE_SCENE,
  FIXTURE_SCENE_IDS,
  FIXTURE_SCENES,
  FixtureVisionProvider,
  isFixtureSceneId,
} from "./fixture";
export type { FixtureProviderOptions, FixtureSceneId } from "./fixture";

// NOTE: the Gemini provider is intentionally NOT re-exported here. It imports
// the `@google/genai` SDK and holds the API key, so it is server-only and must
// be imported directly from "@/providers/gemini" by server code (route handlers).
