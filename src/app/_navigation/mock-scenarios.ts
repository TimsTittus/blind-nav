import type { Announcement } from "./announcement";
import type { StatusCategory } from "./status";
import type { SafetyLevel } from "@/core";

/**
 * Mocked guidance states for Phase 2. Nothing here comes from a camera, GPS,
 * or AI — they exist so every UI state can be built and verified.
 */
export interface MockScenario {
  id: string;
  label: string;
  category: StatusCategory;
  safetyLevel: SafetyLevel;
  announcement: Announcement;
  nextStep: string | null;
  /** Mock sensor links; `false` means "not connected". */
  perceptionOk: boolean;
  gpsOk: boolean;
  aiOk: boolean;
  /** Offset after session start; null = no analysis has happened. */
  analysisOffsetMs: number | null;
  latencyMs: number | null;
}

const LIVE = {
  perceptionOk: true,
  gpsOk: true,
  aiOk: true,
  analysisOffsetMs: 5_000,
  latencyMs: 640,
};

export const AWAITING_SCENARIO_ID = "awaiting";

const AWAITING_SCENARIO: MockScenario = {
  id: AWAITING_SCENARIO_ID,
  label: "Awaiting perception (default)",
  category: "UNKNOWN",
  safetyLevel: "unknown",
  announcement: {
    text: "Path not confirmed. Waiting for perception.",
    priority: "NORMAL",
  },
  nextStep: null,
  perceptionOk: false,
  gpsOk: false,
  aiOk: false,
  analysisOffsetMs: null,
  latencyMs: null,
};

export const MOCK_SCENARIOS: readonly MockScenario[] = [
  AWAITING_SCENARIO,
  {
    id: "clear",
    label: "Path clear",
    category: "SAFE",
    safetyLevel: "safe",
    announcement: {
      text: "Path clear. Continue straight.",
      priority: "NORMAL",
    },
    nextStep: "Turn right in 35 meters",
    ...LIVE,
  },
  {
    id: "turn",
    label: "Turn coming up",
    category: "SAFE",
    safetyLevel: "safe",
    announcement: { text: "Turn right in 20 meters.", priority: "NAVIGATION" },
    nextStep: "Turn right in 20 meters",
    ...LIVE,
  },
  {
    id: "caution",
    label: "Caution",
    category: "CAUTION",
    safetyLevel: "caution",
    announcement: {
      text: "Person approaching on your right. Slow down.",
      priority: "HIGH",
    },
    nextStep: "Turn right in 35 meters",
    ...LIVE,
  },
  {
    id: "danger",
    label: "Danger",
    category: "DANGER",
    safetyLevel: "danger",
    announcement: { text: "Obstacle ahead. Move left.", priority: "HIGH" },
    nextStep: "Turn right in 35 meters",
    ...LIVE,
  },
  {
    id: "critical",
    label: "Critical",
    category: "CRITICAL",
    safetyLevel: "critical",
    announcement: {
      text: "STOP. Obstacle directly ahead.",
      priority: "CRITICAL",
    },
    nextStep: null,
    ...LIVE,
  },
];

export function findScenario(id: string): MockScenario {
  return (
    MOCK_SCENARIOS.find((scenario) => scenario.id === id) ?? AWAITING_SCENARIO
  );
}
