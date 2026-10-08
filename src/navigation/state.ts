export const LOCATION_STATES = [
  "unsupported",
  "permission_required",
  "permission_denied",
  "acquiring",
  "active",
  "error",
  "stale",
] as const;

export type LocationControllerState = (typeof LOCATION_STATES)[number];

export type LocationEvent =
  | { type: "REQUEST" }
  | { type: "UNSUPPORTED" }
  | { type: "DENIED" }
  | { type: "ACQUIRED" }
  | { type: "FAILED" }
  | { type: "STALE" }
  | { type: "STOP" };

type Table = {
  [S in LocationControllerState]: {
    [E in LocationEvent["type"]]?: LocationControllerState;
  };
};

const TABLE: Table = {
  unsupported: { STOP: "permission_required" },
  permission_required: { REQUEST: "acquiring", UNSUPPORTED: "unsupported" },
  permission_denied: {
    REQUEST: "acquiring",
    STOP: "permission_required",
  },
  acquiring: {
    ACQUIRED: "active",
    DENIED: "permission_denied",
    FAILED: "error",
    STOP: "permission_required",
  },
  active: {
    STALE: "stale",
    FAILED: "error",
    STOP: "permission_required",
  },
  error: {
    REQUEST: "acquiring",
    STOP: "permission_required",
  },
  stale: {
    ACQUIRED: "active",
    FAILED: "error",
    STOP: "permission_required",
  },
};

export function transitionLocation(
  state: LocationControllerState,
  event: LocationEvent,
): LocationControllerState | null {
  return TABLE[state][event.type] ?? null;
}
