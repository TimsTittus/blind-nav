/**
 * Shared test helpers for the evaluation framework.
 */
import type { SceneAnalysis } from "@/core";
import {
  FIXTURE_SCENES,
  type FixtureSceneId,
} from "@/providers/fixture/fixtures";
import type { SafetyContext } from "@/safety/types";

/** A valid analysis UUID for test fixtures. */
export const TEST_UUID = "aaaabbbb-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** Wrap a FIXTURE_SCENES entry into a full SceneAnalysis for testing. */
export function sceneAnalysis(
  id: FixtureSceneId,
  capturedAt = 1_000_000,
  now = capturedAt + 200,
): SceneAnalysis {
  return {
    ...FIXTURE_SCENES[id],
    analysisId: TEST_UUID,
    capturedAt,
    analyzedAt: now,
    availability:
      FIXTURE_SCENES[id].overallConfidence < 0.3 ||
      FIXTURE_SCENES[id].uncertainty === "high"
        ? "ambiguous"
        : "ok",
    provider: "fixture",
  };
}

/** Build a minimal SafetyContext from a fixture scene. */
export function safetyContext(
  id: FixtureSceneId,
  now = 1_000_000,
): SafetyContext {
  return {
    sceneAnalysis: sceneAnalysis(id, now - 200, now),
    location: null,
    heading: null,
    route: null,
    currentRouteStep: null,
    now,
  };
}

/** A tiny valid JPEG data URL for image validation tests. */
export const TINY_JPEG = `data:image/jpeg;base64,${"/9j/4AAQSkZJRgABAQAAAQABAAD/".repeat(8)}`;

/** A tiny valid PNG data URL. */
export const TINY_PNG = `data:image/png;base64,${"iVBORw0KGgoAAAANSUhEUgAAAAE=".repeat(8)}`;

/** A tiny valid WebP data URL. */
export const TINY_WEBP = `data:image/webp;base64,${"UklGRiQAAABXRUJQVlA4IB".repeat(4)}`;
