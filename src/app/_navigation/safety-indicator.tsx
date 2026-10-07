import { STATUS_META, type StatusCategory } from "./status";

/**
 * Shows the safety category with text + glyph + border style, never colour
 * alone. Deliberately not a live region: changes are announced through
 * NavigationInstruction so we don't double-announce.
 */
export function SafetyIndicator({ category }: { category: StatusCategory }) {
  const meta = STATUS_META[category];
  return (
    <p className={`safety safety--${category.toLowerCase()}`}>
      <span aria-hidden="true" className="safety__glyph">
        {meta.glyph}
      </span>
      <span className="visually-hidden">Safety status: </span>
      <strong className="safety__label">{meta.label}</strong>
      <span className="safety__summary">{meta.summary}</span>
    </p>
  );
}
