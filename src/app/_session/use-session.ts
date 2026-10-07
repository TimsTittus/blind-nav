"use client";

import { useSyncExternalStore } from "react";
import type { CreateSessionInput, NavigationSession } from "@/core";
import {
  getServerSnapshot,
  getSnapshot,
  startSession,
  stopSession,
  clearSession,
  subscribe,
} from "./session-store";

export interface UseSessionResult {
  session: NavigationSession | null;
  hydrated: boolean;
  start: (input: CreateSessionInput) => NavigationSession;
  stop: () => void;
  clear: () => void;
}

export function useSession(): UseSessionResult {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return {
    session: snapshot.session,
    hydrated: snapshot.hydrated,
    start: startSession,
    stop: stopSession,
    clear: clearSession,
  };
}
