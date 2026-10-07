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
  it("accepts a well-formed obstacle", () => {
    const result = ObstacleSchema.safeParse({
      id: "o1",
      kind: "person",
      confidence: 0.8,
      direction: "center",
      proximity: "near",
    });
    expect(result.success).toBe(true);
  });

  it("rejects confidence outside [0, 1]", () => {
    expect(
      ObstacleSchema.safeParse({ id: "o1", kind: "person", confidence: 1.5 })
        .success,
    ).toBe(false);
  });

  it("rejects an unknown obstacle kind", () => {
    expect(
      ObstacleSchema.safeParse({ id: "o1", kind: "dragon", confidence: 0.5 })
        .success,
    ).toBe(false);
  });
});

describe("SceneAnalysisSchema", () => {
  const valid = {
    analysisId: "a1",
    capturedAt: 1700000000000,
    availability: "ok",
    overallConfidence: 0.7,
    obstacles: [],
    traversability: "unknown",
  };

  it("accepts a well-formed scene", () => {
    expect(SceneAnalysisSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a missing analysisId", () => {
    const { analysisId: _omit, ...rest } = valid;
    void _omit;
    expect(SceneAnalysisSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an invalid availability state", () => {
    expect(
      SceneAnalysisSchema.safeParse({ ...valid, availability: "fine" }).success,
    ).toBe(false);
  });
});

describe("SafetyAssessmentSchema", () => {
  it("accepts a valid assessment", () => {
    expect(
      SafetyAssessmentSchema.safeParse({
        level: "caution",
        reasons: ["Obstacle ahead"],
        assessedAt: 1,
        degraded: false,
      }).success,
    ).toBe(true);
  });

  it("rejects an invalid safety level", () => {
    expect(
      SafetyAssessmentSchema.safeParse({
        level: "danger",
        reasons: [],
        assessedAt: 1,
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
        priority: "normal",
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
          reasons: ["pole"],
          assessedAt: 1,
          degraded: false,
        },
        message: "Caution, obstacle ahead.",
        priority: "high",
        decidedAt: 1,
      }).success,
    ).toBe(true);
  });
});
