import type { SafetyAssessment, SceneAnalysis } from "@/core";
import { SAFETY_CONFIG, type SafetyConfig } from "./config";
import { checkNavigationFusion } from "./fusion";
import {
  applyUncertaintyPenalty,
  evaluateScene,
  hasConflictingObstacles,
  worstSignal,
} from "./rules";
import type {
  FusionOverride,
  PerceptionFusionInput,
  SafetyContext,
  ThreatSignal,
} from "./types";

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

    combined = applyFusionPenalty(combined, context.fusion);

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
    reasons.push(...fusionReasons(context.fusion));

    return {
      assessment: {
        level: combined.level,
        action: combined.action,
        reasons,
        confidence: Math.min(combined.confidence, scene.overallConfidence),
        basedOnAnalysisId: scene.analysisId,
        assessedAt: now,
        expiresAt: now + this.assessmentTtlMs,
        degraded:
          locationDegraded ||
          scene.availability === "stale" ||
          isFusionDegraded(context.fusion),
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

/**
 * Perception assembled from disagreeing or single-source evidence is never
 * reported as `safe`.
 *
 * A conflict between the cloud and the local model means the system does not
 * actually know the path is clear, and local-only evidence means the model that
 * can read a scene has not answered yet. Both land on `caution`, which is the
 * conservative warning state — not a stop, because over-stopping trains the
 * user to ignore the system, and not `safe`, because that would be a claim
 * neither source supports.
 */
function applyFusionPenalty(
  signal: ThreatSignal,
  fusion: PerceptionFusionInput | undefined,
): ThreatSignal {
  if (!fusion) return signal;
  if (signal.level !== "safe") return signal;
  if (fusion.conflicts.length === 0 && !fusion.localOnly) return signal;

  return {
    ...signal,
    level: "caution",
    action: "continue_cautiously",
    reason: fusion.localOnly
      ? "Cloud perception unavailable; local evidence only"
      : "Perception sources disagree",
  };
}

function fusionReasons(fusion: PerceptionFusionInput | undefined): string[] {
  if (!fusion) return [];
  const reasons: string[] = [];
  if (fusion.localOnly) {
    reasons.push("Cloud perception unavailable; local evidence only");
  }
  for (const conflict of fusion.conflicts) {
    reasons.push(`Perception conflict: ${conflict}`);
  }
  return reasons;
}

function isFusionDegraded(fusion: PerceptionFusionInput | undefined): boolean {
  if (!fusion) return false;
  return fusion.localOnly || fusion.conflicts.length > 0;
}
