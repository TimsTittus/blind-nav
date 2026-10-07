/**
 * Pure camera state machine. The controller owns side effects; this file only
 * decides which transitions are legal so they can be tested in isolation.
 */

export const CAMERA_STATES = [
  "idle",
  "requesting_permission",
  "active",
  "paused",
  "error",
  "unsupported",
] as const;

export type CameraState = (typeof CAMERA_STATES)[number];

export type CameraEvent =
  | { type: "REQUEST" }
  | { type: "UNSUPPORTED" }
  /** `paused`: a pause was requested while the permission prompt was open. */
  | { type: "GRANTED"; paused: boolean }
  | { type: "FAILED" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "STOP" };

type Table = {
  [S in CameraState]: {
    [E in CameraEvent["type"]]?:
      CameraState | ((e: CameraEvent) => CameraState);
  };
};

const TABLE: Table = {
  idle: { REQUEST: "requesting_permission", UNSUPPORTED: "unsupported" },
  requesting_permission: {
    GRANTED: (e) => (e.type === "GRANTED" && e.paused ? "paused" : "active"),
    FAILED: "error",
    STOP: "idle",
  },
  active: { PAUSE: "paused", FAILED: "error", STOP: "idle" },
  paused: { RESUME: "active", FAILED: "error", STOP: "idle" },
  error: {
    REQUEST: "requesting_permission",
    UNSUPPORTED: "unsupported",
    STOP: "idle",
  },
  unsupported: { UNSUPPORTED: "unsupported", STOP: "idle" },
};

/** Next state, or `null` when the event is not legal in `state`. */
export function transitionCamera(
  state: CameraState,
  event: CameraEvent,
): CameraState | null {
  const next = TABLE[state][event.type];
  if (next === undefined) return null;
  return typeof next === "function" ? next(event) : next;
}

/** True while a stream is held (tracks must be released on stop). */
export function holdsStream(state: CameraState): boolean {
  return state === "active" || state === "paused";
}
