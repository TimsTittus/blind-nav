import { describe, expect, it } from "vitest";
import type {
  Hazard,
  Obstacle,
  RouteStep,
  SafetyAction,
  SafetyLevel,
  SceneAnalysis,
} from "@/core";
import { SAFETY_CONFIG } from "./config";
import { checkNavigationFusion } from "./fusion";
import {
  evaluateHazard,
  evaluateObstacle,
  evaluatePathStatus,
  hasConflictingObstacles,
  worstSignal,
} from "./rules";
import { SafetyEngine } from "./safety-engine";
import type { SafetyContext, ThreatSignal } from "./types";

const NOW = 1_000_000;

function makeScene(overrides: Partial<SceneAnalysis> = {}): SceneAnalysis {
  return {
    analysisId: "11111111-1111-4111-8111-111111111111",
    capturedAt: NOW - 500,
    analyzedAt: NOW - 200,
    availability: "ok",
    provider: "fixture",
    sceneType: "sidewalk",
    pathStatus: "clear",
    terrain: "even",
    overallConfidence: 0.9,
    uncertainty: "low",
    obstacles: [],
    hazards: [],
    recommendedImmediateAction: "continue",
    description: "Open sidewalk.",
    ...overrides,
  };
}

function makeObstacle(overrides: Partial<Obstacle> = {}): Obstacle {
  return {
    type: "person",
    position: "center",
    relativeDistance: "near",
    severity: "medium",
    confidence: 0.8,
    movement: "stationary",
    ...overrides,
  };
}

function makeHazard(overrides: Partial<Hazard> = {}): Hazard {
  return {
    type: "collision",
    severity: "medium",
    position: "center",
    confidence: 0.8,
    ...overrides,
  };
}

function makeStep(overrides: Partial<RouteStep> = {}): RouteStep {
  return {
    id: "step-1",
    index: 0,
    instruction: "Turn right onto Broadway",
    maneuver: "turn-right",
    ...overrides,
  };
}

function makeContext(overrides: Partial<SafetyContext> = {}): SafetyContext {
  return {
    sceneAnalysis: makeScene(),
    location: null,
    heading: null,
    route: null,
    currentRouteStep: null,
    now: NOW,
    ...overrides,
  };
}

describe("evaluateObstacle", () => {
  interface ObstacleCase {
    name: string;
    obstacle: Partial<Obstacle>;
    expectedLevel: SafetyLevel;
    expectedAction: SafetyAction;
  }

  const cases: ObstacleCase[] = [
    {
      name: "center + very_near + critical → CRITICAL / STOP",
      obstacle: {
        position: "center",
        relativeDistance: "very_near",
        severity: "critical",
      },
      expectedLevel: "critical",
      expectedAction: "stop",
    },
    {
      name: "center + very_near + high → CRITICAL / STOP",
      obstacle: {
        position: "center",
        relativeDistance: "very_near",
        severity: "high",
      },
      expectedLevel: "critical",
      expectedAction: "stop",
    },
    {
      name: "center + near + high → DANGER / STOP",
      obstacle: {
        position: "center",
        relativeDistance: "near",
        severity: "high",
      },
      expectedLevel: "danger",
      expectedAction: "stop",
    },
    {
      name: "center + near + medium → CAUTION / SLOW_DOWN",
      obstacle: {
        position: "center",
        relativeDistance: "near",
        severity: "medium",
      },
      expectedLevel: "caution",
      expectedAction: "slow_down",
    },
    {
      name: "center + near + low → SAFE / CONTINUE",
      obstacle: {
        position: "center",
        relativeDistance: "near",
        severity: "low",
      },
      expectedLevel: "safe",
      expectedAction: "continue",
    },
    {
      name: "center + medium distance + high → CAUTION / SLOW_DOWN",
      obstacle: {
        position: "center",
        relativeDistance: "medium",
        severity: "high",
      },
      expectedLevel: "caution",
      expectedAction: "slow_down",
    },
    {
      name: "right + near + high → CAUTION / MOVE_LEFT",
      obstacle: {
        position: "right",
        relativeDistance: "near",
        severity: "high",
      },
      expectedLevel: "caution",
      expectedAction: "move_left",
    },
    {
      name: "left + near + high → CAUTION / MOVE_RIGHT",
      obstacle: {
        position: "left",
        relativeDistance: "near",
        severity: "high",
      },
      expectedLevel: "caution",
      expectedAction: "move_right",
    },
    {
      name: "right + near + medium → CAUTION / CONTINUE_CAUTIOUSLY",
      obstacle: {
        position: "right",
        relativeDistance: "near",
        severity: "medium",
      },
      expectedLevel: "caution",
      expectedAction: "continue_cautiously",
    },
    {
      name: "center + far + low → SAFE / CONTINUE",
      obstacle: {
        position: "center",
        relativeDistance: "far",
        severity: "low",
      },
      expectedLevel: "safe",
      expectedAction: "continue",
    },
    {
      name: "center + approaching + medium → CAUTION / SLOW_DOWN",
      obstacle: {
        position: "center",
        relativeDistance: "medium",
        severity: "medium",
        movement: "approaching",
      },
      expectedLevel: "caution",
      expectedAction: "slow_down",
    },
    {
      name: "right + approaching + medium → CAUTION / MOVE_LEFT",
      obstacle: {
        position: "right",
        relativeDistance: "medium",
        severity: "medium",
        movement: "approaching",
      },
      expectedLevel: "caution",
      expectedAction: "move_left",
    },
    {
      name: "left + far + low → SAFE / CONTINUE",
      obstacle: {
        position: "left",
        relativeDistance: "far",
        severity: "low",
      },
      expectedLevel: "safe",
      expectedAction: "continue",
    },
    {
      name: "unknown position + near + high → CAUTION / SLOW_DOWN",
      obstacle: {
        position: "unknown",
        relativeDistance: "near",
        severity: "high",
      },
      expectedLevel: "caution",
      expectedAction: "slow_down",
    },
    {
      name: "center + unknown distance + high → DANGER / STOP (unknown distance treated as near)",
      obstacle: {
        position: "center",
        relativeDistance: "unknown",
        severity: "high",
      },
      expectedLevel: "danger",
      expectedAction: "stop",
    },
  ];

  it.each(cases)("$name", ({ obstacle, expectedLevel, expectedAction }) => {
    const signal = evaluateObstacle(makeObstacle(obstacle));
    expect(signal.level).toBe(expectedLevel);
    expect(signal.action).toBe(expectedAction);
  });
});

describe("evaluateHazard", () => {
  interface HazardCase {
    name: string;
    hazard: Partial<Hazard>;
    expectedLevel: SafetyLevel;
    expectedAction: SafetyAction;
  }

  const cases: HazardCase[] = [
    {
      name: "center + high severity → CRITICAL / STOP",
      hazard: { position: "center", severity: "high" },
      expectedLevel: "critical",
      expectedAction: "stop",
    },
    {
      name: "center + critical severity → CRITICAL / STOP",
      hazard: { position: "center", severity: "critical" },
      expectedLevel: "critical",
      expectedAction: "stop",
    },
    {
      name: "right + high severity → DANGER / MOVE_LEFT",
      hazard: { position: "right", severity: "high" },
      expectedLevel: "danger",
      expectedAction: "move_left",
    },
    {
      name: "left + high severity → DANGER / MOVE_RIGHT",
      hazard: { position: "left", severity: "high" },
      expectedLevel: "danger",
      expectedAction: "move_right",
    },
    {
      name: "center + medium severity → CAUTION / CONTINUE_CAUTIOUSLY",
      hazard: { position: "center", severity: "medium" },
      expectedLevel: "caution",
      expectedAction: "continue_cautiously",
    },
    {
      name: "right + low severity → SAFE / CONTINUE",
      hazard: { position: "right", severity: "low" },
      expectedLevel: "safe",
      expectedAction: "continue",
    },
  ];

  it.each(cases)("$name", ({ hazard, expectedLevel, expectedAction }) => {
    const signal = evaluateHazard(makeHazard(hazard));
    expect(signal.level).toBe(expectedLevel);
    expect(signal.action).toBe(expectedAction);
  });
});

describe("evaluatePathStatus", () => {
  it("blocked → CRITICAL / STOP", () => {
    expect(evaluatePathStatus("blocked")).toMatchObject({
      level: "critical",
      action: "stop",
    });
  });

  it("partially_blocked → CAUTION / SLOW_DOWN", () => {
    expect(evaluatePathStatus("partially_blocked")).toMatchObject({
      level: "caution",
      action: "slow_down",
    });
  });

  it("clear → SAFE / CONTINUE", () => {
    expect(evaluatePathStatus("clear")).toMatchObject({
      level: "safe",
      action: "continue",
    });
  });

  it("unknown → CAUTION / CONTINUE_CAUTIOUSLY", () => {
    expect(evaluatePathStatus("unknown")).toMatchObject({
      level: "caution",
      action: "continue_cautiously",
    });
  });
});

describe("worstSignal", () => {
  it("returns SAFE for an empty array", () => {
    expect(worstSignal([]).level).toBe("safe");
  });

  it("picks the highest level", () => {
    const signals: ThreatSignal[] = [
      { level: "safe", action: "continue", reason: "a", confidence: 0.9 },
      { level: "danger", action: "stop", reason: "b", confidence: 0.8 },
      { level: "caution", action: "slow_down", reason: "c", confidence: 0.7 },
    ];
    expect(worstSignal(signals).level).toBe("danger");
  });

  it("prefers higher confidence at the same level", () => {
    const signals: ThreatSignal[] = [
      { level: "caution", action: "slow_down", reason: "a", confidence: 0.5 },
      { level: "caution", action: "move_left", reason: "b", confidence: 0.9 },
    ];
    expect(worstSignal(signals).confidence).toBe(0.9);
  });
});

describe("hasConflictingObstacles", () => {
  it("returns false with no obstacles", () => {
    expect(hasConflictingObstacles([])).toBe(false);
  });

  it("returns false with a single obstacle", () => {
    expect(hasConflictingObstacles([makeObstacle({ position: "left" })])).toBe(
      false,
    );
  });

  it("returns true when near obstacles on both left and right", () => {
    expect(
      hasConflictingObstacles([
        makeObstacle({ position: "left", relativeDistance: "near" }),
        makeObstacle({ position: "right", relativeDistance: "near" }),
      ]),
    ).toBe(true);
  });

  it("returns false when obstacles on both sides but far away", () => {
    expect(
      hasConflictingObstacles([
        makeObstacle({ position: "left", relativeDistance: "far" }),
        makeObstacle({ position: "right", relativeDistance: "far" }),
      ]),
    ).toBe(false);
  });
});

describe("checkNavigationFusion", () => {
  it("returns null when there is no route step", () => {
    expect(checkNavigationFusion("caution", [], null)).toBeNull();
  });

  it("returns null for a non-directional maneuver", () => {
    const step = makeStep({ maneuver: "straight" });
    expect(checkNavigationFusion("caution", [], step)).toBeNull();
  });

  it("returns null when safety level is safe", () => {
    const step = makeStep({ maneuver: "turn-right" });
    expect(checkNavigationFusion("safe", [], step)).toBeNull();
  });

  it("suppresses turn-right when right side is blocked", () => {
    const step = makeStep({ maneuver: "turn-right" });
    const obstacles = [
      makeObstacle({
        position: "right",
        relativeDistance: "near",
        severity: "high",
      }),
    ];
    const result = checkNavigationFusion("caution", obstacles, step);
    expect(result).not.toBeNull();
    expect(result!.reason).toContain("Right side appears blocked");
    expect(result!.suppressedInstruction).toBe("Turn right onto Broadway");
  });

  it("suppresses turn-left when left side is blocked", () => {
    const step = makeStep({
      maneuver: "turn-left",
      instruction: "Turn left onto 5th Ave",
    });
    const obstacles = [
      makeObstacle({
        position: "left",
        relativeDistance: "very_near",
        severity: "critical",
      }),
    ];
    const result = checkNavigationFusion("danger", obstacles, step);
    expect(result).not.toBeNull();
    expect(result!.reason).toContain("Left side appears blocked");
  });

  it("suppresses turn when center is blocked", () => {
    const step = makeStep({ maneuver: "turn-right" });
    const obstacles = [
      makeObstacle({
        position: "center",
        relativeDistance: "near",
        severity: "high",
      }),
    ];
    const result = checkNavigationFusion("danger", obstacles, step);
    expect(result).not.toBeNull();
  });

  it("does not suppress when obstacle is far", () => {
    const step = makeStep({ maneuver: "turn-right" });
    const obstacles = [
      makeObstacle({
        position: "right",
        relativeDistance: "far",
        severity: "high",
      }),
    ];
    expect(checkNavigationFusion("caution", obstacles, step)).toBeNull();
  });

  it("does not suppress when obstacle severity is low", () => {
    const step = makeStep({ maneuver: "turn-right" });
    const obstacles = [
      makeObstacle({
        position: "right",
        relativeDistance: "near",
        severity: "low",
      }),
    ];
    expect(checkNavigationFusion("caution", obstacles, step)).toBeNull();
  });
});

describe("SafetyEngine.assess", () => {
  const engine = new SafetyEngine();

  describe("perception unavailability", () => {
    it("returns UNKNOWN when perception is null", () => {
      const result = engine.assess(makeContext({ sceneAnalysis: null }));
      expect(result.assessment.level).toBe("unknown");
      expect(result.assessment.degraded).toBe(true);
      expect(result.assessment.confidence).toBe(0);
    });

    it("returns UNKNOWN when perception has error availability", () => {
      const result = engine.assess(
        makeContext({ sceneAnalysis: makeScene({ availability: "error" }) }),
      );
      expect(result.assessment.level).toBe("unknown");
    });

    it("returns UNKNOWN when perception has unavailable availability", () => {
      const result = engine.assess(
        makeContext({
          sceneAnalysis: makeScene({ availability: "unavailable" }),
        }),
      );
      expect(result.assessment.level).toBe("unknown");
    });
  });

  describe("stale perception", () => {
    it("returns UNKNOWN when perception is stale", () => {
      const staleScene = makeScene({
        analyzedAt: NOW - SAFETY_CONFIG.perceptionStaleMs - 1,
      });
      const result = engine.assess(makeContext({ sceneAnalysis: staleScene }));
      expect(result.assessment.level).toBe("unknown");
      expect(result.assessment.reasons).toContain("Perception data is stale");
    });

    it("accepts perception within the staleness window", () => {
      const freshScene = makeScene({
        analyzedAt: NOW - SAFETY_CONFIG.perceptionStaleMs + 1000,
      });
      const result = engine.assess(makeContext({ sceneAnalysis: freshScene }));
      expect(result.assessment.level).not.toBe("unknown");
    });
  });

  describe("clear path scenarios", () => {
    it("returns SAFE when path is clear with no obstacles", () => {
      const result = engine.assess(makeContext());
      expect(result.assessment.level).toBe("safe");
      expect(result.assessment.action).toBe("continue");
      expect(result.assessment.degraded).toBe(false);
    });

    it("carries basedOnAnalysisId from the scene", () => {
      const result = engine.assess(makeContext());
      expect(result.assessment.basedOnAnalysisId).toBe(
        "11111111-1111-4111-8111-111111111111",
      );
    });
  });

  describe("obstacle scenarios", () => {
    interface ObstacleScenario {
      name: string;
      obstacles: Partial<Obstacle>[];
      expectedLevel: SafetyLevel;
      expectedAction: SafetyAction;
    }

    const cases: ObstacleScenario[] = [
      {
        name: "center + very_near + critical → CRITICAL / STOP",
        obstacles: [
          {
            position: "center",
            relativeDistance: "very_near",
            severity: "critical",
          },
        ],
        expectedLevel: "critical",
        expectedAction: "stop",
      },
      {
        name: "center + near + high → DANGER / STOP",
        obstacles: [
          {
            position: "center",
            relativeDistance: "near",
            severity: "high",
          },
        ],
        expectedLevel: "danger",
        expectedAction: "stop",
      },
      {
        name: "right + near + high → CAUTION / MOVE_LEFT",
        obstacles: [
          {
            position: "right",
            relativeDistance: "near",
            severity: "high",
          },
        ],
        expectedLevel: "caution",
        expectedAction: "move_left",
      },
      {
        name: "left + near + high → CAUTION / MOVE_RIGHT",
        obstacles: [
          {
            position: "left",
            relativeDistance: "near",
            severity: "high",
          },
        ],
        expectedLevel: "caution",
        expectedAction: "move_right",
      },
      {
        name: "center + far + low → SAFE / CONTINUE",
        obstacles: [
          {
            position: "center",
            relativeDistance: "far",
            severity: "low",
          },
        ],
        expectedLevel: "safe",
        expectedAction: "continue",
      },
    ];

    it.each(cases)("$name", ({ obstacles, expectedLevel, expectedAction }) => {
      const scene = makeScene({
        obstacles: obstacles.map((o) => makeObstacle(o)),
      });
      const result = engine.assess(makeContext({ sceneAnalysis: scene }));
      expect(result.assessment.level).toBe(expectedLevel);
      expect(result.assessment.action).toBe(expectedAction);
    });
  });

  describe("hazard scenarios", () => {
    it("center hazard with high severity → CRITICAL / STOP", () => {
      const scene = makeScene({
        hazards: [makeHazard({ position: "center", severity: "high" })],
      });
      const result = engine.assess(makeContext({ sceneAnalysis: scene }));
      expect(result.assessment.level).toBe("critical");
      expect(result.assessment.action).toBe("stop");
    });

    it("lateral hazard with high severity → DANGER", () => {
      const scene = makeScene({
        hazards: [makeHazard({ position: "right", severity: "high" })],
      });
      const result = engine.assess(makeContext({ sceneAnalysis: scene }));
      expect(result.assessment.level).toBe("danger");
    });
  });

  describe("path status", () => {
    it("blocked path → CRITICAL / STOP", () => {
      const scene = makeScene({ pathStatus: "blocked" });
      const result = engine.assess(makeContext({ sceneAnalysis: scene }));
      expect(result.assessment.level).toBe("critical");
      expect(result.assessment.action).toBe("stop");
    });

    it("partially blocked path → at least CAUTION", () => {
      const scene = makeScene({ pathStatus: "partially_blocked" });
      const result = engine.assess(makeContext({ sceneAnalysis: scene }));
      expect(["caution", "danger", "critical"]).toContain(
        result.assessment.level,
      );
    });
  });

  describe("low confidence / high uncertainty", () => {
    it("penalizes a safe result with high uncertainty to caution", () => {
      const scene = makeScene({ uncertainty: "high" });
      const result = engine.assess(makeContext({ sceneAnalysis: scene }));
      expect(result.assessment.level).toBe("caution");
    });

    it("penalizes a safe result with very low overall confidence", () => {
      const scene = makeScene({ overallConfidence: 0.2 });
      const result = engine.assess(makeContext({ sceneAnalysis: scene }));
      expect(result.assessment.level).toBe("caution");
    });

    it("caps confidence to the scene overall confidence", () => {
      const scene = makeScene({ overallConfidence: 0.4 });
      const result = engine.assess(makeContext({ sceneAnalysis: scene }));
      expect(result.assessment.confidence).toBeLessThanOrEqual(0.4);
    });
  });

  describe("ambiguous perception", () => {
    it("never returns SAFE for ambiguous availability", () => {
      const scene = makeScene({ availability: "ambiguous" });
      const result = engine.assess(makeContext({ sceneAnalysis: scene }));
      expect(result.assessment.level).not.toBe("safe");
    });
  });

  describe("conflicting obstacles", () => {
    it("returns DANGER when obstacles on both sides are near", () => {
      const scene = makeScene({
        obstacles: [
          makeObstacle({ position: "left", relativeDistance: "near" }),
          makeObstacle({ position: "right", relativeDistance: "near" }),
        ],
      });
      const result = engine.assess(makeContext({ sceneAnalysis: scene }));
      expect(result.assessment.level).toBe("danger");
      expect(result.assessment.action).toBe("stop");
    });
  });

  describe("stale location", () => {
    it("marks assessment as degraded when location is stale", () => {
      const result = engine.assess(
        makeContext({
          location: {
            coords: { lat: 40.7, lng: -74.0 },
            timestamp: NOW - SAFETY_CONFIG.locationStaleMs - 1,
          },
        }),
      );
      expect(result.assessment.degraded).toBe(true);
      expect(result.assessment.reasons).toContain("Location data is stale");
    });

    it("is not degraded when location is fresh", () => {
      const result = engine.assess(
        makeContext({
          location: {
            coords: { lat: 40.7, lng: -74.0 },
            timestamp: NOW - 1000,
          },
        }),
      );
      expect(result.assessment.degraded).toBe(false);
    });
  });

  describe("route + obstacle fusion", () => {
    it("suppresses turn-right when right side is blocked", () => {
      const scene = makeScene({
        obstacles: [
          makeObstacle({
            position: "right",
            relativeDistance: "near",
            severity: "high",
          }),
        ],
      });
      const step = makeStep({ maneuver: "turn-right" });
      const result = engine.assess(
        makeContext({ sceneAnalysis: scene, currentRouteStep: step }),
      );
      expect(result.fusionOverride).not.toBeNull();
      expect(result.fusionOverride!.reason).toContain(
        "Right side appears blocked",
      );
    });

    it("does not suppress when path is safe", () => {
      const step = makeStep({ maneuver: "turn-right" });
      const result = engine.assess(makeContext({ currentRouteStep: step }));
      expect(result.fusionOverride).toBeNull();
    });
  });

  describe("assessment expiry", () => {
    it("sets expiresAt in the future", () => {
      const result = engine.assess(makeContext());
      expect(result.assessment.expiresAt).toBeGreaterThan(NOW);
    });

    it("isExpired returns true after expiresAt", () => {
      const result = engine.assess(makeContext());
      expect(engine.isExpired(result.assessment, NOW)).toBe(false);
      expect(
        engine.isExpired(result.assessment, result.assessment.expiresAt),
      ).toBe(true);
      expect(
        engine.isExpired(result.assessment, result.assessment.expiresAt + 1),
      ).toBe(true);
    });

    it("expired assessment should be treated as UNKNOWN", () => {
      const result = engine.assess(makeContext());
      expect(engine.isExpired(result.assessment, NOW + 100_000)).toBe(true);
    });
  });

  describe("multiple obstacles — worst wins", () => {
    it("picks the most dangerous obstacle", () => {
      const scene = makeScene({
        obstacles: [
          makeObstacle({
            position: "left",
            relativeDistance: "far",
            severity: "low",
          }),
          makeObstacle({
            position: "center",
            relativeDistance: "very_near",
            severity: "critical",
          }),
        ],
      });
      const result = engine.assess(makeContext({ sceneAnalysis: scene }));
      expect(result.assessment.level).toBe("critical");
      expect(result.assessment.action).toBe("stop");
    });
  });

  describe("edge cases", () => {
    it("handles zero obstacles and zero hazards as safe", () => {
      const result = engine.assess(makeContext());
      expect(result.assessment.level).toBe("safe");
    });

    it("obstacle with unknown severity treated conservatively", () => {
      const scene = makeScene({
        obstacles: [
          makeObstacle({
            position: "center",
            relativeDistance: "near",
            severity: "unknown",
          }),
        ],
      });
      const result = engine.assess(makeContext({ sceneAnalysis: scene }));
      expect(result.assessment.level).toBe("caution");
    });

    it("obstacle with unknown movement and unknown position", () => {
      const scene = makeScene({
        obstacles: [
          makeObstacle({
            position: "unknown",
            relativeDistance: "far",
            severity: "low",
            movement: "unknown",
          }),
        ],
      });
      const result = engine.assess(makeContext({ sceneAnalysis: scene }));
      expect(result.assessment.level).toBe("safe");
    });

    it("custom config overrides defaults", () => {
      const customEngine = new SafetyEngine({ assessmentTtlMs: 10_000 });
      const result = customEngine.assess(makeContext());
      expect(result.assessment.expiresAt).toBe(NOW + 10_000);
    });
  });
});
