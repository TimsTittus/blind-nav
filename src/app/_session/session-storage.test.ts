import { beforeEach, describe, expect, it } from "vitest";
import { createSession } from "@/core";
import {
  clearSession,
  loadSession,
  saveSession,
  SESSION_STORAGE_KEY,
} from "./session-storage";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("session storage", () => {
  it("returns null when nothing is stored", () => {
    expect(loadSession()).toBeNull();
  });

  it("round-trips a valid session", () => {
    const session = createSession({ mode: "explore", now: 1000 });
    saveSession(session);
    expect(loadSession()).toEqual(session);
  });

  it("clears a stored session", () => {
    saveSession(createSession({ mode: "explore" }));
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it("drops and does not trust invalid persisted data", () => {
    window.sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ not: "a session" }),
    );
    expect(loadSession()).toBeNull();
    // The invalid entry is removed rather than left to fail again.
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it("tolerates malformed JSON", () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, "{not json");
    expect(loadSession()).toBeNull();
  });
});
