import type { SafetyAssessment } from "@/core";

/**
 * UI-facing status categories. `core` only distinguishes clear / caution /
 * stop / unknown; DANGER sits between CAUTION and CRITICAL and will be
 * produced by the Safety Engine in a later phase.
 */
export const STATUS_CATEGORIES = [
  "SAFE",
  "CAUTION",
  "DANGER",
  "CRITICAL",
  "UNKNOWN",
] as const;

export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

export interface StatusMeta {
  /** Spoken/visible name. Never rely on colour — the glyph and text carry it. */
  label: StatusCategory;
  /** Decorative shape cue (hidden from assistive tech; the label is read). */
  glyph: string;
  summary: string;
}

export const STATUS_META: Record<StatusCategory, StatusMeta> = {
  SAFE: { label: "SAFE", glyph: "✓", summary: "No obstacles reported" },
  CAUTION: { label: "CAUTION", glyph: "!", summary: "Take care" },
  DANGER: { label: "DANGER", glyph: "▲", summary: "Obstacle close" },
  CRITICAL: { label: "CRITICAL", glyph: "✖", summary: "Stop now" },
  UNKNOWN: { label: "UNKNOWN", glyph: "?", summary: "Path not confirmed" },
};

/** A degraded or unknown assessment is never presented as SAFE. */
export function categoryFromSafety(safety: SafetyAssessment): StatusCategory {
  switch (safety.level) {
    case "safe":
      return safety.degraded ? "UNKNOWN" : "SAFE";
    case "caution":
      return "CAUTION";
    case "danger":
      return "DANGER";
    case "critical":
      return "CRITICAL";
    case "unknown":
      return "UNKNOWN";
  }
}
