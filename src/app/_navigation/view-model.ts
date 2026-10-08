import type { CameraState } from "@/camera";
import type { NavigationSession, SafetyLevel } from "@/core";
import type { SessionControllerSnapshot } from "@/decision";
import type { Announcement } from "./announcement";
import { findScenario, AWAITING_SCENARIO_ID } from "./mock-scenarios";
import { cameraStatusLabel } from "./camera-status";
import { categoryFromSafety, type StatusCategory } from "./status";

export interface SystemStatusItem {
  id: "camera" | "perception" | "gps" | "ai";
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
  fps: number;
  aiRequestCount: number;
  perceptionFreshness: string;
  gpsAccuracy: number | null;
  speechQueueActive: boolean;
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
  /** Real camera state; defaults to "idle" (camera off). */
  camera?: CameraState;
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
  camera = "idle",
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
        id: "camera",
        label: "Camera",
        value: cameraStatusLabel(camera),
        ok: camera === "active",
      },
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
      fps: 0,
      aiRequestCount: 0,
      perceptionFreshness: "none",
      gpsAccuracy: null,
      speechQueueActive: false,
    },
  };
}

// ── Real-data view model from controller snapshot ────────────────

const SAFETY_ANNOUNCEMENTS: Record<SafetyLevel, Announcement> = {
  critical: { text: "Stop. Immediate danger detected.", priority: "CRITICAL" },
  danger: {
    text: "Warning. Significant obstacle ahead.",
    priority: "HIGH",
  },
  caution: { text: "Caution. Obstacle nearby.", priority: "NAVIGATION" },
  safe: { text: "Path is clear. Continue.", priority: "NORMAL" },
  unknown: {
    text: "Safety cannot be determined. Proceed with caution.",
    priority: "NAVIGATION",
  },
};

const LOCATION_STATE_LABELS: Record<string, string> = {
  permission_required: "Awaiting permission",
  acquiring: "Acquiring…",
  active: "Active",
  stale: "Stale",
  error: "Error",
  permission_denied: "Denied",
  unsupported: "Unsupported",
};

export interface RealViewModelInput {
  session: NavigationSession;
  snapshot: SessionControllerSnapshot;
  paused: boolean;
}

export function buildRealViewModel({
  session,
  snapshot,
  paused,
}: RealViewModelInput): NavigationViewModel {
  const category: StatusCategory = paused
    ? "UNKNOWN"
    : categoryFromSafety(snapshot.safety);

  const announcement: Announcement = paused
    ? PAUSED_ANNOUNCEMENT
    : SAFETY_ANNOUNCEMENTS[snapshot.safety.level];

  const perceptionLabel =
    snapshot.perception.status === "ok"
      ? `Active (${snapshot.perceptionFreshness})`
      : snapshot.perception.status;

  const gpsLabel =
    LOCATION_STATE_LABELS[snapshot.location.state] ?? snapshot.location.state;

  const aiLabel = snapshot.perception.inFlight
    ? "Processing…"
    : snapshot.perception.analysis
      ? "Connected"
      : "Not connected";

  const routeStep = snapshot.route.currentStep;

  return {
    category,
    announcement,
    destinationLabel: session.destination?.label ?? null,
    nextStep: paused ? null : (routeStep?.instruction ?? null),
    systems: [
      {
        id: "camera",
        label: "Camera",
        value: cameraStatusLabel(snapshot.camera),
        ok: snapshot.camera === "active",
      },
      {
        id: "perception",
        label: "Perception",
        value: perceptionLabel,
        ok: snapshot.perception.status === "ok",
      },
      {
        id: "gps",
        label: "GPS",
        value: gpsLabel,
        ok: snapshot.location.state === "active",
      },
      {
        id: "ai",
        label: "AI",
        value: aiLabel,
        ok: snapshot.perception.analysis !== null,
      },
    ],
    debug: {
      sessionId: session.id,
      mode: session.mode,
      perception: perceptionLabel,
      gps: gpsLabel,
      ai: aiLabel,
      safetyLevel: snapshot.safety.level,
      lastAnalysisAt: snapshot.stats.lastAnalysisAt,
      latencyMs: snapshot.stats.aiLatencyMs,
      fps: snapshot.stats.fps,
      aiRequestCount: snapshot.stats.aiRequestCount,
      perceptionFreshness: snapshot.perceptionFreshness,
      gpsAccuracy: snapshot.location.location?.accuracyMeters ?? null,
      speechQueueActive: snapshot.stats.lastSpeechAt !== null,
    },
  };
}
