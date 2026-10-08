"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { NavigationSession } from "@/core";
import { NavigationSessionController } from "@/decision";
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
import { buildRealViewModel, buildViewModel } from "./view-model";

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

function ActiveNavigation({
  session,
  onStop,
}: {
  session: NavigationSession;
  onStop: () => void;
}) {
  const [controller] = useState(() => new NavigationSessionController());

  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  const [paused, setPaused] = useState(false);
  const [scenarioId, setScenarioId] = useState(AWAITING_SCENARIO_ID);
  const [debugOpen, setDebugOpen] = useState(false);
  const [speechTestOpen, setSpeechTestOpen] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  useEffect(() => {
    void controller.start(session);
    return () => controller.dispose();
  }, [controller, session]);

  useEffect(() => {
    if (snapshot.phase === "running" && paused) {
      controller.pause();
    } else if (snapshot.phase === "paused" && !paused) {
      controller.resume();
    }
  }, [paused, snapshot.phase, controller]);

  const handleToggleVoice = useCallback(() => {
    setVoiceEnabled((prev) => {
      const next = !prev;
      controller.updateVoiceSettings({
        enabled: next,
        rate: 1,
        pitch: 1,
        volume: 1,
      });
      return next;
    });
  }, [controller]);

  const videoRef = useCallback(
    (element: HTMLVideoElement | null) => controller.attachVideo(element),
    [controller],
  );

  const handleStop = useCallback(() => {
    controller.stop();
    onStop();
  }, [controller, onStop]);

  const useMock = scenarioId !== AWAITING_SCENARIO_ID;

  const view = useMemo(() => {
    if (useMock) {
      return buildViewModel({
        session,
        scenarioId,
        paused,
        camera: snapshot.camera,
      });
    }
    return buildRealViewModel({ session, snapshot, paused });
  }, [useMock, session, scenarioId, paused, snapshot]);

  return (
    <div className="nav-screen">
      <h1 className="nav-screen__title">Navigation mode</h1>
      <div className="nav-screen__camera">
        <CameraViewport
          state={snapshot.camera}
          error={null}
          videoRef={videoRef}
          canSwitch={controller.canSwitchCamera}
          switching={controller.isSwitchingCamera}
          onStart={() => controller.startCamera()}
          onSwitch={() => controller.switchCamera()}
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
            voiceEnabled={voiceEnabled}
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
        <SpeechTestPanel onClose={() => setSpeechTestOpen(false)} />
      ) : null}
    </div>
  );
}
