import { describe, expect, it } from "vitest";
import {
  HeadingStateSchema,
  LocationStateSchema,
  NavigationDecisionSchema,
  ObstacleSchema,
  RouteSchema,
  RouteStepSchema,
  SafetyAssessmentSchema,
  SceneAnalysisSchema,
  SpeechInstructionSchema,
} from "./index";

describe("ObstacleSchema", () => {
  const obstacle = {
    type: "person",
    position: "center",
    relativeDistance: "near",
    severity: "medium",
    confidence: 0.8,
    movement: "approaching",
  };

  it("accepts a well-formed obstacle", () => {
    expect(ObstacleSchema.safeParse(obstacle).success).toBe(true);
  });

  it("rejects confidence outside [0, 1]", () => {
    expect(
      ObstacleSchema.safeParse({ ...obstacle, confidence: 1.5 }).success,
    ).toBe(false);
  });

  it("rejects an unknown obstacle type", () => {
    expect(
      ObstacleSchema.safeParse({ ...obstacle, type: "dragon" }).success,
    ).toBe(false);
  });

  it("has no field for a precise distance in meters", () => {
    // The system has no depth sensor: obstacles carry only a relative category.
    expect("distanceMeters" in ObstacleSchema.shape).toBe(false);
  });
});

describe("SceneAnalysisSchema", () => {
  const valid = {
    analysisId: "11111111-1111-4111-8111-111111111111",
    capturedAt: 1700000000000,
    analyzedAt: 1700000000500,
    availability: "ok",
    provider: "fixture",
    sceneType: "sidewalk",
    pathStatus: "clear",
    terrain: "even",
    overallConfidence: 0.7,
    uncertainty: "low",
    obstacles: [],
    hazards: [],
    recommendedImmediateAction: "continue",
    description: "Open sidewalk ahead.",
  };

  it("accepts a well-formed scene", () => {
    expect(SceneAnalysisSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a non-UUID analysisId", () => {
    expect(
      SceneAnalysisSchema.safeParse({ ...valid, analysisId: "a1" }).success,
    ).toBe(false);
  });

  it("rejects an invalid availability state", () => {
    expect(
      SceneAnalysisSchema.safeParse({ ...valid, availability: "fine" }).success,
    ).toBe(false);
  });

  it("rejects an invalid path status", () => {
    expect(
      SceneAnalysisSchema.safeParse({ ...valid, pathStatus: "mostly" }).success,
    ).toBe(false);
  });
});

describe("SafetyAssessmentSchema", () => {
  it("accepts a valid assessment", () => {
    expect(
      SafetyAssessmentSchema.safeParse({
        level: "caution",
        action: "slow_down",
        reasons: ["Obstacle ahead"],
        confidence: 0.8,
        assessedAt: 1,
        expiresAt: 5000,
        degraded: false,
      }).success,
    ).toBe(true);
  });

  it("rejects an invalid safety level", () => {
    expect(
      SafetyAssessmentSchema.safeParse({
        level: "panic",
        action: "none",
        reasons: [],
        confidence: 0,
        assessedAt: 1,
        expiresAt: 1,
        degraded: false,
      }).success,
    ).toBe(false);
  });
});

describe("location & heading schemas", () => {
  it("rejects out-of-range latitude", () => {
    expect(
      LocationStateSchema.safeParse({
        coords: { lat: 200, lng: 0 },
        timestamp: 1,
      }).success,
    ).toBe(false);
  });

  it("rejects a heading greater than 360 degrees", () => {
    expect(
      HeadingStateSchema.safeParse({ degrees: 400, timestamp: 1 }).success,
    ).toBe(false);
  });
});

describe("route schemas", () => {
  it("accepts a valid route", () => {
    const result = RouteSchema.safeParse({
      id: "22222222-2222-4222-8222-222222222222",
      destination: { id: "d1", label: "Park" },
      steps: [{ id: "s1", index: 0, instruction: "Head north" }],
      createdAt: 1,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative step distance", () => {
    expect(
      RouteStepSchema.safeParse({
        id: "s1",
        index: 0,
        instruction: "Head north",
        distanceMeters: -5,
      }).success,
    ).toBe(false);
  });
});

describe("speech & decision schemas", () => {
  it("rejects empty speech text", () => {
    expect(
      SpeechInstructionSchema.safeParse({
        id: "33333333-3333-4333-8333-333333333333",
        text: "",
        priority: "information",
        interrupt: false,
        createdAt: 1,
      }).success,
    ).toBe(false);
  });

  it("accepts a valid navigation decision", () => {
    expect(
      NavigationDecisionSchema.safeParse({
        kind: "caution",
        safety: {
          level: "caution",
          action: "slow_down",
          reasons: ["pole"],
          confidence: 0.7,
          assessedAt: 1,
          expiresAt: 5000,
          degraded: false,
        },
        message: "Caution, obstacle ahead.",
        priority: "high",
        decidedAt: 1,
      }).success,
    ).toBe(true);
  });
});
