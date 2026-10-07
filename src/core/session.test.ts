import { describe, expect, it } from "vitest";
import {
  completeSession,
  createSession,
  isSessionActive,
  NavigationSessionSchema,
  stopSession,
  type CreateSessionInput,
} from "./session";

const FIXED_ID = "11111111-1111-4111-8111-111111111111";

describe("createSession", () => {
  it("creates a valid, active session with explicit uncertainty", () => {
    const session = createSession({ mode: "explore", id: FIXED_ID, now: 1000 });

    expect(session.id).toBe(FIXED_ID);
    expect(session.mode).toBe("explore");
    expect(session.status).toBe("active");
    expect(session.createdAt).toBe(1000);
    expect(session.updatedAt).toBe(1000);
    expect(session.perception.availability).toBe("unavailable");
    expect(session.safety.level).toBe("unknown");
    expect(session.safety.degraded).toBe(true);
    expect(NavigationSessionSchema.safeParse(session).success).toBe(true);
  });

  it("generates a UUID when no id is provided", () => {
    const session = createSession({ mode: "navigate" });
    expect(session.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("attaches an optional destination in navigate mode", () => {
    const session = createSession({
      mode: "navigate",
      destination: { id: "dest-1", label: "Library" },
    });
    expect(session.destination?.label).toBe("Library");
  });

  it("omits destination when none is given", () => {
    const session = createSession({ mode: "explore" });
    expect(session.destination).toBeUndefined();
  });

  it("rejects an invalid mode", () => {
    expect(() =>
      createSession({ mode: "fly" } as unknown as CreateSessionInput),
    ).toThrow();
  });

  it("rejects a non-UUID injected id", () => {
    expect(() =>
      createSession({ mode: "explore", id: "not-a-uuid" }),
    ).toThrow();
  });
});

describe("session transitions", () => {
  it("stopSession marks the session stopped and touches updatedAt", () => {
    const session = createSession({ mode: "explore", id: FIXED_ID, now: 1000 });
    const stopped = stopSession(session, 2000);
    expect(stopped.status).toBe("stopped");
    expect(stopped.updatedAt).toBe(2000);
    expect(session.status).toBe("active");
  });

  it("completeSession marks the session completed", () => {
    const session = createSession({
      mode: "navigate",
      id: FIXED_ID,
      now: 1000,
    });
    expect(completeSession(session, 3000).status).toBe("completed");
  });

  it("isSessionActive reflects status", () => {
    const session = createSession({ mode: "explore", id: FIXED_ID, now: 1000 });
    expect(isSessionActive(session)).toBe(true);
    expect(isSessionActive(stopSession(session))).toBe(false);
  });
});

describe("NavigationSessionSchema", () => {
  it("rejects a session missing required perception/safety state", () => {
    const result = NavigationSessionSchema.safeParse({
      id: FIXED_ID,
      createdAt: 1,
      updatedAt: 1,
      mode: "explore",
      status: "active",
    });
    expect(result.success).toBe(false);
  });
});
