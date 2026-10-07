import type { NavigationSession } from "@/core";

export function SessionDetails({ session }: { session: NavigationSession }) {
  const created = new Date(session.createdAt).toLocaleTimeString();
  return (
    <dl className="session-details">
      <div>
        <dt>Mode</dt>
        <dd>
          {session.mode === "navigate"
            ? "Navigate to a destination"
            : "Explore surroundings"}
        </dd>
      </div>
      <div>
        <dt>Status</dt>
        <dd>{session.status}</dd>
      </div>
      <div>
        <dt>Session id</dt>
        <dd>
          <code>{session.id.slice(0, 8)}</code>
        </dd>
      </div>
      <div>
        <dt>Started</dt>
        <dd>{created}</dd>
      </div>
      {session.destination ? (
        <div>
          <dt>Destination</dt>
          <dd>{session.destination.label}</dd>
        </div>
      ) : null}
      <div>
        <dt>Perception</dt>
        <dd>{session.perception.availability}</dd>
      </div>
      <div>
        <dt>Safety</dt>
        <dd>
          {session.safety.level}
          {session.safety.degraded ? " (degraded — not confirmed clear)" : ""}
        </dd>
      </div>
    </dl>
  );
}
