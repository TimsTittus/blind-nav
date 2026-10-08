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
import type { SceneQuerySnapshot } from "@/decision";
import { VoiceInput } from "@/voice";
import type { VoiceInputResult } from "@/voice";
import { useSession } from "../_session/use-session";
import { CameraViewport } from "../_navigation/camera-viewport";
import { NavigationInstruction } from "../_navigation/navigation-instruction";
import { SafetyIndicator } from "../_navigation/safety-indicator";
import { SessionControls } from "../_navigation/session-controls";
import { SystemStatus } from "../_navigation/system-status";
import { buildRealViewModel } from "../_navigation/view-model";
import { QueryInput } from "./query-input";

export function ExploreScreen() {
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

  if (session.mode !== "explore") {
    return (
      <p role="note" className="disclaimer">
        This session is in <strong>{session.mode}</strong> mode.{" "}
        <Link href="/navigate">Open the navigate page</Link> to match it.
      </p>
    );
  }

  return (
    <ActiveExplore
      session={session}
      onStop={() => {
        stop();
        clear();
        router.push("/");
      }}
    />
  );
}

function ActiveExplore({
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

  const handleQuestion = useCallback(
    (question: string) => {
      controller.submitQuery(question);
    },
    [controller],
  );

  const [voiceInput] = useState(() => {
    return new VoiceInput({
      onResult: (result: VoiceInputResult) => {
        if (result.isFinal && result.transcript.trim().length > 0) {
          handleQuestion(result.transcript.trim());
        }
      },
    });
  });

  const [paused, setPaused] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  useEffect(() => {
    void controller.start(session);
    return () => {
      controller.dispose();
      voiceInput.dispose();
    };
  }, [controller, session, voiceInput]);

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

  const view = useMemo(
    () => buildRealViewModel({ session, snapshot, paused }),
    [session, snapshot, paused],
  );

  return (
    <div className="nav-screen">
      <h1 className="nav-screen__title">Explore mode</h1>
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
          <div className="status-overlay">
            <SafetyIndicator category={view.category} />
          </div>
        </CameraViewport>
      </div>
      <div className="nav-screen__panel">
        <NavigationInstruction announcement={view.announcement} />
        <QueryStatus querySnapshot={snapshot.query} />
        <QueryInput
          voiceInput={voiceInput}
          onSubmit={handleQuestion}
          disabled={snapshot.phase !== "running"}
        />
        <SystemStatus items={view.systems} />
        <div className="nav-screen__controls">
          <SessionControls
            voiceEnabled={voiceEnabled}
            paused={paused}
            onToggleVoice={handleToggleVoice}
            onTogglePause={() => setPaused((v) => !v)}
            onStop={handleStop}
          />
        </div>
      </div>
    </div>
  );
}

function QueryStatus({ querySnapshot }: { querySnapshot: SceneQuerySnapshot }) {
  if (querySnapshot.state === "idle" && !querySnapshot.lastAnswer) return null;

  return (
    <div className="query-status" aria-live="polite">
      {querySnapshot.state === "capturing" ||
      querySnapshot.state === "querying" ? (
        <p className="query-status__processing">Thinking…</p>
      ) : null}
      {querySnapshot.state === "error" && querySnapshot.lastError ? (
        <p className="query-status__error">{querySnapshot.lastError}</p>
      ) : null}
      {querySnapshot.lastAnswer &&
      querySnapshot.state !== "capturing" &&
      querySnapshot.state !== "querying" ? (
        <p className="query-status__answer">{querySnapshot.lastAnswer}</p>
      ) : null}
    </div>
  );
}
