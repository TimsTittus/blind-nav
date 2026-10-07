import {
  createSession,
  stopSession as stopSessionPure,
  type CreateSessionInput,
  type NavigationSession,
} from "@/core";
import {
  clearSession as clearStorage,
  loadSession,
  saveSession,
} from "./session-storage";

export interface SessionSnapshot {
  session: NavigationSession | null;
  hydrated: boolean;
}

// A stable reference used for SSR and the hydration render.
const SERVER_SNAPSHOT: SessionSnapshot = { session: null, hydrated: false };

let snapshot: SessionSnapshot = SERVER_SNAPSHOT;
let initialized = false;
const listeners = new Set<() => void>();

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;
  snapshot = { session: loadSession(), hydrated: true };
}

function emit(): void {
  for (const listener of listeners) listener();
}

function setSession(session: NavigationSession | null): void {
  snapshot = { session, hydrated: true };
  emit();
}

export function subscribe(listener: () => void): () => void {
  ensureInitialized();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): SessionSnapshot {
  ensureInitialized();
  return snapshot;
}

export function getServerSnapshot(): SessionSnapshot {
  return SERVER_SNAPSHOT;
}

export function startSession(input: CreateSessionInput): NavigationSession {
  const session = createSession(input);
  saveSession(session);
  setSession(session);
  return session;
}

export function stopSession(): void {
  if (!snapshot.session) return;
  const stopped = stopSessionPure(snapshot.session);
  saveSession(stopped);
  setSession(stopped);
}

export function clearSession(): void {
  clearStorage();
  setSession(null);
}
