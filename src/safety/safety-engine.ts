import type { SafetyAssessment, SceneAnalysis } from "@/core";
import { SAFETY_CONFIG, type SafetyConfig } from "./config";
import { checkNavigationFusion } from "./fusion";
import {
  applyUncertaintyPenalty,
  evaluateScene,
  hasConflictingObstacles,
  worstSignal,
} from "./rules";
import type { FusionOverride, SafetyContext } from "./types";

export interface SafetyResult {
  readonly assessment: SafetyAssessment;
  readonly fusionOverride: FusionOverride | null;
}

export class SafetyEngine {
  private readonly perceptionStaleMs: number;
  private readonly locationStaleMs: number;
  private readonly assessmentTtlMs: number;

  constructor(config: Partial<SafetyConfig> = {}) {
    this.perceptionStaleMs =
      config.perceptionStaleMs ?? SAFETY_CONFIG.perceptionStaleMs;
    this.locationStaleMs =
      config.locationStaleMs ?? SAFETY_CONFIG.locationStaleMs;
    this.assessmentTtlMs =
      config.assessmentTtlMs ?? SAFETY_CONFIG.assessmentTtlMs;
  }

  assess(context: SafetyContext): SafetyResult {
    const { now } = context;

    if (!context.sceneAnalysis) {
      return this.unknownResult(now, "Perception unavailable");
    }

    if (this.isPerceptionStale(context.sceneAnalysis, now)) {
      return this.unknownResult(now, "Perception data is stale");
    }

    if (context.sceneAnalysis.availability === "error") {
      return this.unknownResult(now, "Perception error");
    }

    if (context.sceneAnalysis.availability === "unavailable") {
      return this.unknownResult(now, "Perception unavailable");
    }

    const scene = context.sceneAnalysis;

    if (hasConflictingObstacles(scene.obstacles)) {
      return {
        assessment: {
          level: "danger",
          action: "stop",
          reasons: ["Conflicting obstacles detected on multiple sides"],
          confidence: Math.min(
            ...scene.obstacles.map((o) => o.confidence),
            scene.overallConfidence,
          ),
          basedOnAnalysisId: scene.analysisId,
          assessedAt: now,
          expiresAt: now + this.assessmentTtlMs,
          degraded: false,
        },
        fusionOverride: null,
      };
    }

    const signals = evaluateScene(scene);
    let combined = worstSignal(signals);
    combined = applyUncertaintyPenalty(combined, scene);

    if (scene.availability === "ambiguous" && combined.level === "safe") {
      combined = {
        ...combined,
        level: "caution",
        action: "continue_cautiously",
        reason: `${combined.reason} (ambiguous perception)`,
      };
    }

    const locationDegraded =
      context.location !== null &&
      this.isLocationStale(context.location.timestamp, now);

    const fusionOverride = checkNavigationFusion(
      combined.level,
      scene.obstacles,
      context.currentRouteStep,
    );

    const reasons = signals
      .filter((s) => s.level !== "safe")
      .map((s) => s.reason);
    if (reasons.length === 0 && combined.level === "safe") {
      reasons.push("No threats detected");
    }
    if (fusionOverride) {
      reasons.push(fusionOverride.reason);
    }
    if (locationDegraded) {
      reasons.push("Location data is stale");
    }

    return {
      assessment: {
        level: combined.level,
        action: combined.action,
        reasons,
        confidence: Math.min(combined.confidence, scene.overallConfidence),
        basedOnAnalysisId: scene.analysisId,
        assessedAt: now,
        expiresAt: now + this.assessmentTtlMs,
        degraded: locationDegraded || scene.availability === "stale",
      },
      fusionOverride,
    };
  }

  isExpired(assessment: SafetyAssessment, now: number): boolean {
    return now >= assessment.expiresAt;
  }

  private isPerceptionStale(scene: SceneAnalysis, now: number): boolean {
    return now - scene.analyzedAt > this.perceptionStaleMs;
  }

  private isLocationStale(locationTimestamp: number, now: number): boolean {
    return now - locationTimestamp > this.locationStaleMs;
  }

  private unknownResult(now: number, reason: string): SafetyResult {
    return {
      assessment: {
        level: "unknown",
        action: "none",
        reasons: [reason],
        confidence: 0,
        assessedAt: now,
        expiresAt: now + this.assessmentTtlMs,
        degraded: true,
      },
      fusionOverride: null,
    };
  }
}
