"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "../_session/use-session";
import { CameraViewport } from "./camera-viewport";
import { DebugOverlay } from "./debug-overlay";
import { DestinationStatus } from "./destination-status";
import { AWAITING_SCENARIO_ID } from "./mock-scenarios";
import { NavigationInstruction } from "./navigation-instruction";
import { NavigationStatusOverlay } from "./navigation-status-overlay";
import { SessionControls } from "./session-controls";
import { SystemStatus } from "./system-status";
import { buildViewModel } from "./view-model";

// Inlined at build time so the debug overlay is dead-code-eliminated from
// production bundles. Must stay in this module for the constant to fold.
const DEBUG_AVAILABLE = process.env.NODE_ENV !== "production";

export function NavigationScreen() {
  const { session, hydrated, stop, clear } = useSession();
  const router = useRouter();
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [paused, setPaused] = useState(false);
  const [scenarioId, setScenarioId] = useState(AWAITING_SCENARIO_ID);
  const [debugOpen, setDebugOpen] = useState(false);

  if (!hydrated) {
    return <p aria-live="polite">Preparing session…</p>;
  }

  if (!session || session.status !== "active") {
    return (
      <p>
        No active session. <Link href="/">Start one on the home page.</Link>
      </p>
    );
  }

  if (session.mode !== "navigate") {
    return (
      <p role="note" className="disclaimer">
        This session is in <strong>{session.mode}</strong> mode.{" "}
        <Link href="/explore">Open the explore page</Link> to match it.
      </p>
    );
  }

  const view = buildViewModel({ session, scenarioId, paused });

  function handleStop() {
    stop();
    clear();
    router.push("/");
  }

  return (
    <div className="nav-screen">
      <h1 className="nav-screen__title">Navigation mode</h1>
      <div className="nav-screen__camera">
        <CameraViewport>
          <NavigationStatusOverlay category={view.category} />
        </CameraViewport>
      </div>
      <div className="nav-screen__panel">
        <NavigationInstruction announcement={view.announcement} />
        <DestinationStatus
          destination={view.destinationLabel}
          nextStep={view.nextStep}
        />
        <SystemStatus items={view.systems} />
        <div className="nav-screen__controls">
          <SessionControls
            voiceEnabled={voiceEnabled}
            paused={paused}
            onToggleVoice={() => setVoiceEnabled((value) => !value)}
            onTogglePause={() => setPaused((value) => !value)}
            onStop={handleStop}
          />
          {DEBUG_AVAILABLE ? (
            <button
              type="button"
              className="control-button control-button--small"
              aria-pressed={debugOpen}
              onClick={() => setDebugOpen((value) => !value)}
            >
              Debug
            </button>
          ) : null}
        </div>
      </div>
      {DEBUG_AVAILABLE && debugOpen ? (
        <DebugOverlay
          info={view.debug}
          scenarioId={scenarioId}
          onScenarioChange={setScenarioId}
          onClose={() => setDebugOpen(false)}
        />
      ) : null}
    </div>
  );
}
