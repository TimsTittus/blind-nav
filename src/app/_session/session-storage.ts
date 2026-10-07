import { NavigationSessionSchema, type NavigationSession } from "@/core";

const STORAGE_KEY = "blind-nav.session.v1";

function getStore(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadSession(): NavigationSession | null {
  const store = getStore();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = NavigationSessionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      // Stale/incompatible shape: drop it rather than trust it.
      store.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function saveSession(session: NavigationSession): void {
  const store = getStore();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Quota / disabled storage — session still lives in memory this session.
  }
}

export function clearSession(): void {
  const store = getStore();
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export { STORAGE_KEY as SESSION_STORAGE_KEY };
