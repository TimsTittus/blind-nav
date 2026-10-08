import { describe, expect, it } from "vitest";
import type { SafetyAssessment, SpeechPriority } from "@/core";
import { SESSION_CONTROLLER_CONFIG } from "./config";
import { SpeechDispatch, type SpeechSink } from "./speech-dispatch";

function assessment(
  level: SafetyAssessment["level"],
  overrides?: Partial<SafetyAssessment>,
): SafetyAssessment {
  return {
    level,
    action: "none",
    reasons: [],
    confidence: 0.8,
    assessedAt: 0,
    expiresAt: 3000,
    degraded: false,
    ...overrides,
  };
}

function createSink() {
  const calls: Array<{ text: string; priority: SpeechPriority }> = [];
  const sink: SpeechSink = {
    speak(text, priority) {
      calls.push({ text, priority });
    },
  };
  return { sink, calls };
}

describe("SpeechDispatch", () => {
  describe("safety updates", () => {
    it("speaks immediately for critical level", () => {
      const { sink, calls } = createSink();
      const dispatch = new SpeechDispatch(SESSION_CONTROLLER_CONFIG, sink);
      dispatch.onSafetyUpdate(assessment("critical"), null, 1000);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.priority).toBe("critical");
      expect(calls[0]!.text).toContain("Stop");
    });

    it("speaks immediately for danger level", () => {
      const { sink, calls } = createSink();
      const dispatch = new SpeechDispatch(SESSION_CONTROLLER_CONFIG, sink);
      dispatch.onSafetyUpdate(assessment("danger"), null, 1000);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.priority).toBe("high");
    });

    it("speaks fusion override as high priority", () => {
      const { sink, calls } = createSink();
      const dispatch = new SpeechDispatch(SESSION_CONTROLLER_CONFIG, sink);
      dispatch.onSafetyUpdate(
        assessment("caution"),
        { suppressedInstruction: "turn right", reason: "Right side blocked." },
        1000,
      );
      expect(calls).toHaveLength(1);
      expect(calls[0]!.text).toBe("Right side blocked.");
      expect(calls[0]!.priority).toBe("high");
    });

    it("suppresses duplicate safety speech within cooldown", () => {
      const { sink, calls } = createSink();
      const dispatch = new SpeechDispatch(SESSION_CONTROLLER_CONFIG, sink);
      dispatch.onSafetyUpdate(assessment("caution"), null, 1000);
      expect(calls).toHaveLength(1);

      dispatch.onSafetyUpdate(assessment("caution"), null, 1500);
      expect(calls).toHaveLength(1);
    });

    it("speaks again after cooldown", () => {
      const { sink, calls } = createSink();
      const dispatch = new SpeechDispatch(SESSION_CONTROLLER_CONFIG, sink);
      dispatch.onSafetyUpdate(assessment("safe"), null, 0);
      expect(calls).toHaveLength(1);

      const afterCooldown =
        SESSION_CONTROLLER_CONFIG.safetySpeechCooldownMs + 1;
      dispatch.onSafetyUpdate(assessment("caution"), null, afterCooldown);
      expect(calls).toHaveLength(2);
    });

    it("always speaks on level change (critical/danger bypass cooldown)", () => {
      const { sink, calls } = createSink();
      const dispatch = new SpeechDispatch(SESSION_CONTROLLER_CONFIG, sink);
      dispatch.onSafetyUpdate(assessment("safe"), null, 0);
      dispatch.onSafetyUpdate(assessment("critical"), null, 100);
      expect(calls).toHaveLength(2);
    });
  });

  describe("route updates", () => {
    it("announces arrival once", () => {
      const { sink, calls } = createSink();
      const dispatch = new SpeechDispatch(SESSION_CONTROLLER_CONFIG, sink);
      const route = {
        status: "arrived" as const,
        currentStepIndex: 2,
        distanceToStepMeters: 0,
        totalProgressFraction: 1,
        currentStep: null,
        nextStep: null,
      };
      dispatch.onRouteUpdate(route, 1000);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.text).toContain("arrived");

      dispatch.onRouteUpdate(route, 2000);
      expect(calls).toHaveLength(1);
    });

    it("announces off-route once", () => {
      const { sink, calls } = createSink();
      const dispatch = new SpeechDispatch(SESSION_CONTROLLER_CONFIG, sink);
      const route = {
        status: "off_route" as const,
        currentStepIndex: 0,
        distanceToStepMeters: 100,
        totalProgressFraction: 0,
        currentStep: null,
        nextStep: null,
      };
      dispatch.onRouteUpdate(route, 1000);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.text).toContain("off route");

      dispatch.onRouteUpdate(route, 2000);
      expect(calls).toHaveLength(1);
    });

    it("announces step change when cooldown elapsed", () => {
      const { sink, calls } = createSink();
      const dispatch = new SpeechDispatch(SESSION_CONTROLLER_CONFIG, sink);
      const step = {
        status: "navigating" as const,
        currentStepIndex: 1,
        distanceToStepMeters: 50,
        totalProgressFraction: 0.5,
        currentStep: {
          id: "step-1",
          index: 1,
          instruction: "Turn left on Main St",
          distanceMeters: 50,
        },
        nextStep: null,
      };
      dispatch.onRouteUpdate(step, 10_000);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.text).toBe("Turn left on Main St");
    });
  });

  describe("freshness changes", () => {
    it("announces perception stale", () => {
      const { sink, calls } = createSink();
      const dispatch = new SpeechDispatch(SESSION_CONTROLLER_CONFIG, sink);
      dispatch.onFreshnessChange("fresh", 1000);
      dispatch.onFreshnessChange("stale", 5000);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.text).toContain("stale");
    });

    it("announces perception unavailable", () => {
      const { sink, calls } = createSink();
      const dispatch = new SpeechDispatch(SESSION_CONTROLLER_CONFIG, sink);
      dispatch.onFreshnessChange("fresh", 1000);
      dispatch.onFreshnessChange("none", 5000);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.text).toContain("unavailable");
    });

    it("does not announce transition from none to none", () => {
      const { sink, calls } = createSink();
      const dispatch = new SpeechDispatch(SESSION_CONTROLLER_CONFIG, sink);
      dispatch.onFreshnessChange("none", 1000);
      expect(calls).toHaveLength(0);
    });
  });

  describe("reset", () => {
    it("clears state so fresh speech fires again", () => {
      const { sink, calls } = createSink();
      const dispatch = new SpeechDispatch(SESSION_CONTROLLER_CONFIG, sink);
      dispatch.onSafetyUpdate(assessment("safe"), null, 0);
      expect(calls).toHaveLength(1);
      dispatch.reset();
      dispatch.onSafetyUpdate(assessment("safe"), null, 100);
      expect(calls).toHaveLength(2);
    });
  });
});
