import { describe, expect, it } from "vitest";
import { createSession, type SafetyAssessment } from "@/core";
import { MOCK_SCENARIOS } from "./mock-scenarios";
import { categoryFromSafety } from "./status";
import { buildViewModel } from "./view-model";

const session = createSession({
  mode: "navigate",
  destination: { id: "d1", label: "SJCET" },
  now: 1_000,
});

function safety(
  level: SafetyAssessment["level"],
  degraded = false,
): SafetyAssessment {
  return { level, reasons: [], assessedAt: 0, degraded };
}

describe("categoryFromSafety", () => {
  it("maps core levels to UI categories", () => {
    expect(categoryFromSafety(safety("clear"))).toBe("SAFE");
    expect(categoryFromSafety(safety("caution"))).toBe("CAUTION");
    expect(categoryFromSafety(safety("stop"))).toBe("CRITICAL");
    expect(categoryFromSafety(safety("unknown"))).toBe("UNKNOWN");
  });

  it("never reports SAFE for a degraded assessment", () => {
    expect(categoryFromSafety(safety("clear", true))).toBe("UNKNOWN");
  });
});

describe("buildViewModel", () => {
  it("defaults honestly to UNKNOWN from the real session", () => {
    const view = buildViewModel({
      session,
      scenarioId: "awaiting",
      paused: false,
    });
    expect(view.category).toBe("UNKNOWN");
    expect(view.debug.perception).toBe("unavailable");
    expect(view.debug.lastAnalysisAt).toBeNull();
    expect(view.destinationLabel).toBe("SJCET");
  });

  it("degrades to UNKNOWN when paused, even in a SAFE scenario", () => {
    const view = buildViewModel({ session, scenarioId: "clear", paused: true });
    expect(view.category).toBe("UNKNOWN");
    expect(view.nextStep).toBeNull();
  });

  it("falls back to the awaiting scenario for unknown ids", () => {
    const view = buildViewModel({ session, scenarioId: "nope", paused: false });
    expect(view.category).toBe("UNKNOWN");
  });

  it("covers every status category and priority with scenarios", () => {
    const categories = new Set(MOCK_SCENARIOS.map((s) => s.category));
    expect([...categories].sort()).toEqual([
      "CAUTION",
      "CRITICAL",
      "DANGER",
      "SAFE",
      "UNKNOWN",
    ]);
    const priorities = new Set(
      MOCK_SCENARIOS.map((s) => s.announcement.priority),
    );
    expect([...priorities].sort()).toEqual([
      "CRITICAL",
      "HIGH",
      "NAVIGATION",
      "NORMAL",
    ]);
  });

  it("computes the analysis timestamp from the session start", () => {
    const view = buildViewModel({
      session,
      scenarioId: "clear",
      paused: false,
    });
    expect(view.debug.lastAnalysisAt).toBe(6_000);
    expect(view.debug.latencyMs).toBe(640);
  });
});
