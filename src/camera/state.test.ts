import { describe, expect, it } from "vitest";
import {
  CAMERA_STATES,
  holdsStream,
  transitionCamera,
  type CameraEvent,
  type CameraState,
} from "./state";

const run = (from: CameraState, ...events: CameraEvent[]) =>
  events.reduce<CameraState | null>(
    (state, event) => (state ? transitionCamera(state, event) : null),
    from,
  );

describe("transitionCamera", () => {
  it("follows the happy path idle → requesting → active → paused → active → idle", () => {
    expect(
      run(
        "idle",
        { type: "REQUEST" },
        { type: "GRANTED", paused: false },
        { type: "PAUSE" },
        { type: "RESUME" },
        { type: "STOP" },
      ),
    ).toBe("idle");
  });

  it("goes straight to paused when paused during the permission prompt", () => {
    expect(
      run("idle", { type: "REQUEST" }, { type: "GRANTED", paused: true }),
    ).toBe("paused");
  });

  it("reports permission failure as error and allows retry", () => {
    expect(run("idle", { type: "REQUEST" }, { type: "FAILED" })).toBe("error");
    expect(run("error", { type: "REQUEST" })).toBe("requesting_permission");
  });

  it("can fail while active or paused (device lost)", () => {
    expect(run("active", { type: "FAILED" })).toBe("error");
    expect(run("paused", { type: "FAILED" })).toBe("error");
  });

  it("marks unsupported browsers and only leaves via STOP", () => {
    expect(run("idle", { type: "UNSUPPORTED" })).toBe("unsupported");
    expect(run("unsupported", { type: "REQUEST" })).toBeNull();
    expect(run("unsupported", { type: "STOP" })).toBe("idle");
  });

  it("rejects illegal transitions", () => {
    expect(run("idle", { type: "PAUSE" })).toBeNull();
    expect(run("idle", { type: "RESUME" })).toBeNull();
    expect(run("idle", { type: "GRANTED", paused: false })).toBeNull();
    expect(run("active", { type: "REQUEST" })).toBeNull();
    expect(run("active", { type: "RESUME" })).toBeNull();
    expect(run("paused", { type: "PAUSE" })).toBeNull();
    expect(run("requesting_permission", { type: "PAUSE" })).toBeNull();
  });

  it("STOP is legal from every state that is not already idle", () => {
    for (const state of CAMERA_STATES) {
      expect(transitionCamera(state, { type: "STOP" })).toBe(
        state === "idle" ? null : "idle",
      );
    }
  });

  it("holds a stream only while active or paused", () => {
    expect(CAMERA_STATES.filter(holdsStream)).toEqual(["active", "paused"]);
  });
});
