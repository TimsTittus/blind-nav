import {
  PRIORITY_META,
  type Announcement,
  type AnnouncementPriority,
} from "./announcement";

/**
 * Two persistent live regions (they must exist before their content changes).
 * Assertive is reserved for CRITICAL/HIGH; the rest wait politely. Only the
 * instruction text lives here, and React leaves the DOM alone when the text is
 * unchanged, so repeats and unrelated state changes are not re-announced.
 */
function LiveAnnouncer({
  text,
  assertive,
}: {
  text: string;
  assertive: boolean;
}) {
  return (
    <div className="visually-hidden">
      <div role="status" aria-live="polite" aria-atomic="true">
        {assertive ? "" : text}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true">
        {assertive ? text : ""}
      </div>
    </div>
  );
}

/** Speech-priority-aware instruction: visible text, priority label, and the
 * matching announcement politeness. Speech synthesis comes in a later phase. */
export function NavigationInstruction({
  announcement,
}: {
  announcement: Announcement;
}) {
  const { text, priority } = announcement;
  const meta = PRIORITY_META[priority];
  return (
    <div className={`instruction instruction--${slug(priority)}`}>
      <p className="instruction__priority">{meta.label}</p>
      <p className="instruction__text">{text}</p>
      <LiveAnnouncer text={text} assertive={meta.assertive} />
    </div>
  );
}

function slug(priority: AnnouncementPriority): string {
  return priority.toLowerCase();
}
