import type { NavigationSession } from "@/core";
import type { Announcement } from "./announcement";
import { findScenario, AWAITING_SCENARIO_ID } from "./mock-scenarios";
import { categoryFromSafety, type StatusCategory } from "./status";

export interface SystemStatusItem {
  id: "perception" | "gps" | "ai";
  label: string;
  value: string;
  ok: boolean;
}

export interface DebugInfo {
  sessionId: string;
  mode: string;
  perception: string;
  gps: string;
  ai: string;
  safetyLevel: string;
  lastAnalysisAt: number | null;
  latencyMs: number | null;
}

export interface NavigationViewModel {
  category: StatusCategory;
  announcement: Announcement;
  destinationLabel: string | null;
  nextStep: string | null;
  systems: SystemStatusItem[];
  debug: DebugInfo;
}

export interface ViewModelInput {
  session: NavigationSession;
  scenarioId: string;
  paused: boolean;
}

const PAUSED_ANNOUNCEMENT: Announcement = {
  text: "Paused. Path is not being monitored.",
  priority: "NORMAL",
};

const MOCK_OK = "Active (simulated)";
const NOT_CONNECTED = "Not connected";

/**
 * Pure mapping from session + mock scenario to what the screen shows. The
 * default scenario reflects the real session (perception unavailable, safety
 * unknown); pausing always degrades to UNKNOWN, never to SAFE.
 */
export function buildViewModel({
  session,
  scenarioId,
  paused,
}: ViewModelInput): NavigationViewModel {
  const scenario = findScenario(scenarioId);
  const fromSession = scenario.id === AWAITING_SCENARIO_ID;

  const perceptionState = fromSession
    ? session.perception.availability
    : scenario.perceptionOk
      ? "ok"
      : "unavailable";
  const safetyLevel = fromSession ? session.safety.level : scenario.safetyLevel;
  const category = paused
    ? "UNKNOWN"
    : fromSession
      ? categoryFromSafety(session.safety)
      : scenario.category;

  return {
    category,
    announcement: paused ? PAUSED_ANNOUNCEMENT : scenario.announcement,
    destinationLabel: session.destination?.label ?? null,
    nextStep: paused ? null : scenario.nextStep,
    systems: [
      {
        id: "perception",
        label: "Perception",
        value: perceptionState === "ok" ? MOCK_OK : perceptionState,
        ok: perceptionState === "ok",
      },
      {
        id: "gps",
        label: "GPS",
        value: scenario.gpsOk ? MOCK_OK : NOT_CONNECTED,
        ok: scenario.gpsOk,
      },
      {
        id: "ai",
        label: "AI",
        value: scenario.aiOk ? MOCK_OK : NOT_CONNECTED,
        ok: scenario.aiOk,
      },
    ],
    debug: {
      sessionId: session.id,
      mode: session.mode,
      perception: perceptionState,
      gps: scenario.gpsOk ? "simulated" : "not connected",
      ai: scenario.aiOk ? "simulated" : "not connected",
      safetyLevel,
      lastAnalysisAt:
        scenario.analysisOffsetMs === null
          ? null
          : session.createdAt + scenario.analysisOffsetMs,
      latencyMs: scenario.latencyMs,
    },
  };
}
