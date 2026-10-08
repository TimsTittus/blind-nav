"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createDevLoggingConsumer, useCamera, useFrameLoop } from "@/camera";
import type { NavigationSession } from "@/core";
import { useSpeech } from "@/speech";
import { useSession } from "../_session/use-session";
import { CameraViewport } from "./camera-viewport";
import { DebugOverlay } from "./debug-overlay";
import { DestinationStatus } from "./destination-status";
import { AWAITING_SCENARIO_ID } from "./mock-scenarios";
import { NavigationInstruction } from "./navigation-instruction";
import { NavigationStatusOverlay } from "./navigation-status-overlay";
import { SessionControls } from "./session-controls";
import { SpeechTestPanel } from "./speech-test-panel";
import { SystemStatus } from "./system-status";
import { buildViewModel } from "./view-model";

// Inlined at build time so the debug overlay is dead-code-eliminated from
// production bundles. Must stay in this module for the constant to fold.
const DEBUG_AVAILABLE = process.env.NODE_ENV !== "production";

export function NavigationScreen() {
  const { session, hydrated, stop, clear } = useSession();
  const router = useRouter();

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

  return (
    <ActiveNavigation
      session={session}
      onStop={() => {
        stop();
        clear();
        router.push("/");
      }}
    />
  );
}

// Mock consumer: logs frame metadata in development only (no pixels, no
// network, no storage). Replaced by the perception pipeline in a later phase.
const devConsumer = createDevLoggingConsumer();

/**
 * Mounted only for an active navigate session, so the camera starts on entry
 * and is released (tracks stopped) on unmount, stop, or navigation away.
 */
function ActiveNavigation({
  session,
  onStop,
}: {
  session: NavigationSession;
  onStop: () => void;
}) {
  const camera = useCamera();
  const {
    start: startCamera,
    pause: pauseCamera,
    resume: resumeCamera,
  } = camera;
  const speech = useSpeech();
  const [paused, setPaused] = useState(false);
  const [scenarioId, setScenarioId] = useState(AWAITING_SCENARIO_ID);
  const [debugOpen, setDebugOpen] = useState(false);
  const [speechTestOpen, setSpeechTestOpen] = useState(false);

  useEffect(() => {
    void startCamera();
  }, [startCamera]);

  // PAUSE guidance also pauses the camera; resume is idempotent and the
  // controller keeps tab-hidden pauses separate from this one.
  useEffect(() => {
    if (paused) pauseCamera();
    else resumeCamera();
  }, [paused, camera.state, pauseCamera, resumeCamera]);

  // Sync voice enabled/disabled with speech engine.
  function handleToggleVoice() {
    const next = !speech.settings.enabled;
    speech.updateSettings({ enabled: next });
    if (!next) speech.stop();
  }

  useFrameLoop({
    enabled: DEBUG_AVAILABLE && camera.state === "active",
    captureFrame: camera.captureFrame,
    consumer: devConsumer,
  });

  const view = buildViewModel({
    session,
    scenarioId,
    paused,
    camera: camera.state,
  });

  function handleStop() {
    camera.stop();
    speech.stop();
    onStop();
  }

  return (
    <div className="nav-screen">
      <h1 className="nav-screen__title">Navigation mode</h1>
      <div className="nav-screen__camera">
        <CameraViewport
          state={camera.state}
          error={camera.error}
          videoRef={camera.videoRef}
          canSwitch={camera.canSwitch}
          switching={camera.switching}
          onStart={() => void camera.start()}
          onSwitch={() => void camera.switchCamera()}
        >
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
            voiceEnabled={speech.settings.enabled}
            paused={paused}
            onToggleVoice={handleToggleVoice}
            onTogglePause={() => setPaused((value) => !value)}
            onStop={handleStop}
          />
          {DEBUG_AVAILABLE ? (
            <>
              <button
                type="button"
                className="control-button control-button--small"
                aria-pressed={debugOpen}
                onClick={() => setDebugOpen((value) => !value)}
              >
                Debug
              </button>
              <button
                type="button"
                className="control-button control-button--small"
                aria-pressed={speechTestOpen}
                onClick={() => setSpeechTestOpen((value) => !value)}
              >
                Speech test
              </button>
            </>
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
      {DEBUG_AVAILABLE && speechTestOpen ? (
        <SpeechTestPanel
          speech={speech}
          onClose={() => setSpeechTestOpen(false)}
        />
      ) : null}
    </div>
  );
}
