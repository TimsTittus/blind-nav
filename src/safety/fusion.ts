import type { Maneuver, Obstacle, RouteStep, SafetyLevel } from "@/core";
import type { FusionOverride } from "./types";

const DIRECTION_MANEUVERS: ReadonlySet<Maneuver> = new Set([
  "turn-right",
  "slight-right",
  "turn-left",
  "slight-left",
]);

const RIGHT_MANEUVERS: ReadonlySet<Maneuver> = new Set([
  "turn-right",
  "slight-right",
]);

const LEFT_MANEUVERS: ReadonlySet<Maneuver> = new Set([
  "turn-left",
  "slight-left",
]);

export function checkNavigationFusion(
  level: SafetyLevel,
  obstacles: readonly Obstacle[],
  currentStep: RouteStep | null,
): FusionOverride | null {
  if (!currentStep?.maneuver) return null;
  if (!DIRECTION_MANEUVERS.has(currentStep.maneuver)) return null;
  if (level === "safe") return null;

  const isRightTurn = RIGHT_MANEUVERS.has(currentStep.maneuver);
  const isLeftTurn = LEFT_MANEUVERS.has(currentStep.maneuver);

  const blockingSide = isRightTurn ? "right" : isLeftTurn ? "left" : null;
  if (!blockingSide) return null;

  const blocked = obstacles.some(
    (o) =>
      o.position === blockingSide &&
      (o.relativeDistance === "near" || o.relativeDistance === "very_near") &&
      (o.severity === "high" || o.severity === "critical"),
  );

  const centerBlocked = obstacles.some(
    (o) =>
      o.position === "center" &&
      (o.relativeDistance === "near" || o.relativeDistance === "very_near") &&
      (o.severity === "high" || o.severity === "critical"),
  );

  if (blocked || centerBlocked) {
    return {
      suppressedInstruction: currentStep.instruction,
      reason: `${blockingSide.charAt(0).toUpperCase() + blockingSide.slice(1)} side appears blocked. Continue carefully.`,
    };
  }

  return null;
}
