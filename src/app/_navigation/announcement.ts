/**
 * Speech priorities the UI understands. Speech output itself belongs to a
 * later phase; this only decides how a message is presented and announced.
 */
export type AnnouncementPriority =
  "CRITICAL" | "HIGH" | "NAVIGATION" | "NORMAL";

export interface Announcement {
  text: string;
  priority: AnnouncementPriority;
}

export interface PriorityMeta {
  label: string;
  /** Interrupts screen readers (assertive) vs. waits its turn (polite). */
  assertive: boolean;
}

export const PRIORITY_META: Record<AnnouncementPriority, PriorityMeta> = {
  CRITICAL: { label: "Critical alert", assertive: true },
  HIGH: { label: "Warning", assertive: true },
  NAVIGATION: { label: "Navigation", assertive: false },
  NORMAL: { label: "Status", assertive: false },
};
