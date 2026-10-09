export type CapabilityState =
  "checking" | "available" | "unavailable" | "denied" | "prompt";

export interface CapabilityReport {
  readonly state: CapabilityState;
  readonly reason: string;
}

export interface CapabilitySet {
  readonly camera: CapabilityReport;
  readonly location: CapabilityReport;
  readonly speech: CapabilityReport;
  readonly microphone: CapabilityReport;
  readonly orientation: CapabilityReport;
  /** Local computer-vision inference: runtime support **and** model weights. */
  readonly localPerception: CapabilityReport;
}

export const CHECKING_REPORT: CapabilityReport = {
  state: "checking",
  reason: "Checking availability…",
};
