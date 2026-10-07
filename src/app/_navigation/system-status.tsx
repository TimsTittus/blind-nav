import type { SystemStatusItem } from "./view-model";

/** Perception / GPS / AI link health. Text + glyph, not colour. Not live. */
export function SystemStatus({ items }: { items: SystemStatusItem[] }) {
  return (
    <section aria-label="System status">
      <ul className="system-status">
        {items.map((item) => (
          <li key={item.id} className={item.ok ? "is-ok" : "is-off"}>
            <span aria-hidden="true">{item.ok ? "●" : "○"}</span>{" "}
            <strong>{item.label}:</strong> {item.value}
          </li>
        ))}
      </ul>
    </section>
  );
}
