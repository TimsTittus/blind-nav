import type { SafetyAssessment, SafetyLevel, SpeechPriority } from "@/core";
import type { FusionOverride } from "@/safety";
import type { RouteTrackerState } from "@/navigation";
import type { SessionControllerConfig } from "./config";
import type { PerceptionFreshness } from "./types";

export interface SpeechSink {
  speak(text: string, priority: SpeechPriority): void;
}

interface SpeechDispatchState {
  lastSafetyLevel: SafetyLevel | null;
  lastSafetySpeechAt: number;
  lastRouteStepIndex: number;
  lastRouteStatus: string | null;
  lastNavigationSpeechAt: number;
  lastFreshness: PerceptionFreshness;
  announcedArrival: boolean;
}

function initialDispatchState(): SpeechDispatchState {
  return {
    lastSafetyLevel: null,
    lastSafetySpeechAt: -Infinity,
    lastRouteStepIndex: -1,
    lastRouteStatus: null,
    lastNavigationSpeechAt: -Infinity,
    lastFreshness: "none",
    announcedArrival: false,
  };
}

const SAFETY_MESSAGES: Record<SafetyLevel, string> = {
  critical: "Stop. Immediate danger detected.",
  danger: "Warning. Significant obstacle ahead. Stop or avoid.",
  caution: "Caution. Obstacle nearby. Proceed carefully.",
  safe: "Path is clear. Continue.",
  unknown: "Cannot determine safety. Proceed with caution.",
};

const SAFETY_PRIORITY: Record<SafetyLevel, SpeechPriority> = {
  critical: "critical",
  danger: "high",
  caution: "navigation",
  safe: "low",
  unknown: "navigation",
};

export class SpeechDispatch {
  private readonly config: SessionControllerConfig;
  private readonly sink: SpeechSink;
  private state: SpeechDispatchState;

  constructor(config: SessionControllerConfig, sink: SpeechSink) {
    this.config = config;
    this.sink = sink;
    this.state = initialDispatchState();
  }

  onSafetyUpdate(
    assessment: SafetyAssessment,
    fusionOverride: FusionOverride | null,
    now: number,
  ): void {
    const { level } = assessment;

    if (level === "critical" || level === "danger") {
      this.sink.speak(SAFETY_MESSAGES[level], SAFETY_PRIORITY[level]);
      this.state.lastSafetyLevel = level;
      this.state.lastSafetySpeechAt = now;
      return;
    }

    if (fusionOverride) {
      this.sink.speak(fusionOverride.reason, "high");
      this.state.lastSafetySpeechAt = now;
      return;
    }

    const levelChanged = level !== this.state.lastSafetyLevel;
    const cooldownElapsed =
      now - this.state.lastSafetySpeechAt >= this.config.safetySpeechCooldownMs;

    if (levelChanged && cooldownElapsed) {
      this.sink.speak(SAFETY_MESSAGES[level], SAFETY_PRIORITY[level]);
      this.state.lastSafetyLevel = level;
      this.state.lastSafetySpeechAt = now;
    }
  }

  onRouteUpdate(route: RouteTrackerState, now: number): void {
    if (route.status === "arrived" && !this.state.announcedArrival) {
      this.sink.speak("You have arrived at your destination.", "high");
      this.state.announcedArrival = true;
      this.state.lastNavigationSpeechAt = now;
      return;
    }

    if (route.status === "off_route") {
      if (this.state.lastRouteStatus !== "off_route") {
        this.sink.speak(
          "You appear to be off route. Recalculating.",
          "navigation",
        );
        this.state.lastRouteStatus = route.status;
        this.state.lastNavigationSpeechAt = now;
      }
      return;
    }

    const stepChanged =
      route.currentStepIndex !== this.state.lastRouteStepIndex;
    const cooldownElapsed =
      now - this.state.lastNavigationSpeechAt >=
      this.config.navigationSpeechCooldownMs;

    if (stepChanged && cooldownElapsed && route.currentStep) {
      this.sink.speak(route.currentStep.instruction, "navigation");
      this.state.lastRouteStepIndex = route.currentStepIndex;
      this.state.lastNavigationSpeechAt = now;
    }

    this.state.lastRouteStatus = route.status;
  }

  onFreshnessChange(freshness: PerceptionFreshness, now: number): void {
    if (freshness === this.state.lastFreshness) return;
    const prev = this.state.lastFreshness;
    this.state.lastFreshness = freshness;

    if (freshness === "stale" && prev !== "stale" && prev !== "none") {
      this.sink.speak(
        "Perception data is stale. Proceed with caution.",
        "navigation",
      );
    } else if (freshness === "none" && prev !== "none") {
      this.sink.speak(
        "Perception unavailable. Safety cannot be determined.",
        "high",
      );
    }

    void now;
  }

  reset(): void {
    this.state = initialDispatchState();
  }
}
