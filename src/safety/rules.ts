import type {
  Hazard,
  Obstacle,
  ObstaclePosition,
  PathStatus,
  RelativeDistance,
  SceneAnalysis,
  Severity,
} from "@/core";
import type { ThreatSignal } from "./types";

const SEVERITY_RANK: Record<Severity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
  unknown: 1,
};

const DISTANCE_RANK: Record<RelativeDistance, number> = {
  far: 0,
  medium: 1,
  near: 2,
  very_near: 3,
  unknown: 2,
};

const LEVEL_RANK = { safe: 0, caution: 1, danger: 2, critical: 3 } as const;

function maxLevel(
  a: "safe" | "caution" | "danger" | "critical",
  b: "safe" | "caution" | "danger" | "critical",
): "safe" | "caution" | "danger" | "critical" {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

export function evaluateObstacle(obstacle: Obstacle): ThreatSignal {
  const sev = SEVERITY_RANK[obstacle.severity];
  const dist = DISTANCE_RANK[obstacle.relativeDistance];
  const isCenter = obstacle.position === "center";
  const isApproaching = obstacle.movement === "approaching";

  if (isCenter && dist >= 3 && sev >= 2) {
    return {
      level: "critical",
      action: "stop",
      reason: `${obstacle.label ?? obstacle.type} directly ahead, very close`,
      confidence: obstacle.confidence,
    };
  }

  if (isCenter && dist >= 2 && sev >= 2) {
    return {
      level: "danger",
      action: "stop",
      reason: `${obstacle.label ?? obstacle.type} ahead, close`,
      confidence: obstacle.confidence,
    };
  }

  if (isCenter && dist >= 2 && sev >= 1) {
    return {
      level: "caution",
      action: "slow_down",
      reason: `${obstacle.label ?? obstacle.type} ahead`,
      confidence: obstacle.confidence,
    };
  }

  if (isCenter && dist >= 1 && sev >= 2) {
    return {
      level: "caution",
      action: "slow_down",
      reason: `${obstacle.label ?? obstacle.type} ahead at medium distance`,
      confidence: obstacle.confidence,
    };
  }

  if (isCenter && isApproaching) {
    return {
      level: "caution",
      action: "slow_down",
      reason: `${obstacle.label ?? obstacle.type} approaching from ahead`,
      confidence: obstacle.confidence,
    };
  }

  const lateral = lateralAction(obstacle.position);

  if (dist >= 2 && sev >= 2) {
    return {
      level: "caution",
      action: lateral,
      reason: `${obstacle.label ?? obstacle.type} on the ${obstacle.position}, close`,
      confidence: obstacle.confidence,
    };
  }

  if (dist >= 2 && sev >= 1) {
    return {
      level: "caution",
      action: "continue_cautiously",
      reason: `${obstacle.label ?? obstacle.type} on the ${obstacle.position}`,
      confidence: obstacle.confidence,
    };
  }

  if (isApproaching && sev >= 1) {
    return {
      level: "caution",
      action: lateral,
      reason: `${obstacle.label ?? obstacle.type} approaching from the ${obstacle.position}`,
      confidence: obstacle.confidence,
    };
  }

  return {
    level: "safe",
    action: "continue",
    reason: `${obstacle.label ?? obstacle.type} detected (${obstacle.position}, ${obstacle.relativeDistance})`,
    confidence: obstacle.confidence,
  };
}

export function evaluateHazard(hazard: Hazard): ThreatSignal {
  const sev = SEVERITY_RANK[hazard.severity];
  const isCenter = hazard.position === "center";

  if (isCenter && sev >= 2) {
    return {
      level: "critical",
      action: "stop",
      reason: `${hazard.type} hazard directly ahead`,
      confidence: hazard.confidence,
    };
  }

  if (sev >= 2) {
    return {
      level: "danger",
      action: lateralAction(hazard.position),
      reason: `${hazard.type} hazard on the ${hazard.position}`,
      confidence: hazard.confidence,
    };
  }

  if (sev >= 1) {
    return {
      level: "caution",
      action: "continue_cautiously",
      reason: `${hazard.type} hazard (${hazard.position})`,
      confidence: hazard.confidence,
    };
  }

  return {
    level: "safe",
    action: "continue",
    reason: `minor ${hazard.type} hazard`,
    confidence: hazard.confidence,
  };
}

export function evaluatePathStatus(pathStatus: PathStatus): ThreatSignal {
  switch (pathStatus) {
    case "blocked":
      return {
        level: "critical",
        action: "stop",
        reason: "Path is blocked",
        confidence: 1,
      };
    case "partially_blocked":
      return {
        level: "caution",
        action: "slow_down",
        reason: "Path is partially blocked",
        confidence: 1,
      };
    case "clear":
      return {
        level: "safe",
        action: "continue",
        reason: "Path is clear",
        confidence: 1,
      };
    case "unknown":
      return {
        level: "caution",
        action: "continue_cautiously",
        reason: "Path status is unknown",
        confidence: 0,
      };
  }
}

export function evaluateScene(scene: SceneAnalysis): ThreatSignal[] {
  const signals: ThreatSignal[] = [];

  signals.push(evaluatePathStatus(scene.pathStatus));

  for (const obstacle of scene.obstacles) {
    signals.push(evaluateObstacle(obstacle));
  }
  for (const hazard of scene.hazards) {
    signals.push(evaluateHazard(hazard));
  }

  return signals;
}

export function worstSignal(signals: readonly ThreatSignal[]): ThreatSignal {
  if (signals.length === 0) {
    return {
      level: "safe",
      action: "continue",
      reason: "No threats detected",
      confidence: 1,
    };
  }

  let worst = signals[0]!;
  for (let i = 1; i < signals.length; i++) {
    const s = signals[i]!;
    const worstRank =
      LEVEL_RANK[worst.level === "unknown" ? "safe" : worst.level];
    const sRank = LEVEL_RANK[s.level === "unknown" ? "safe" : s.level];
    if (sRank > worstRank) {
      worst = s;
    } else if (sRank === worstRank && s.confidence > worst.confidence) {
      worst = s;
    }
  }
  return worst;
}

export function hasConflictingObstacles(
  obstacles: readonly Obstacle[],
): boolean {
  const nearOrCloser = obstacles.filter(
    (o) => DISTANCE_RANK[o.relativeDistance] >= 2,
  );
  if (nearOrCloser.length < 2) return false;

  const positions = new Set(nearOrCloser.map((o) => o.position));
  return positions.has("left") && positions.has("right");
}

function lateralAction(
  position: ObstaclePosition,
): "move_left" | "move_right" | "slow_down" {
  switch (position) {
    case "right":
      return "move_left";
    case "left":
      return "move_right";
    default:
      return "slow_down";
  }
}

export function applyUncertaintyPenalty(
  signal: ThreatSignal,
  scene: SceneAnalysis,
): ThreatSignal {
  if (scene.uncertainty === "high" || scene.overallConfidence < 0.3) {
    const penalizedLevel =
      signal.level === "safe"
        ? "caution"
        : maxLevel(
            signal.level as "safe" | "caution" | "danger" | "critical",
            "caution",
          );
    return {
      ...signal,
      level: penalizedLevel,
      confidence: Math.min(signal.confidence, scene.overallConfidence),
      reason: `${signal.reason} (low confidence)`,
    };
  }
  return signal;
}
