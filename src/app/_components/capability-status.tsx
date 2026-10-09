"use client";

import { useCapabilities } from "@/capabilities";
import type { CapabilityReport, CapabilityState } from "@/capabilities";

const STATE_LABELS: Record<CapabilityState, string> = {
  checking: "Checking",
  available: "Ready",
  unavailable: "Unsupported",
  denied: "Denied",
  prompt: "Needs permission",
};

const CAPABILITY_LABELS: Record<string, string> = {
  camera: "Camera",
  location: "Location",
  speech: "Speech output",
  microphone: "Voice input",
  orientation: "Orientation",
  localPerception: "On-device vision",
};

function CapabilityRow({
  name,
  report,
}: {
  name: string;
  report: CapabilityReport;
}) {
  return (
    <li className={`capability-row capability-row--${report.state}`}>
      <span className="capability-row__indicator" aria-hidden="true">
        {report.state === "available"
          ? "✓"
          : report.state === "unavailable"
            ? "✗"
            : report.state === "denied"
              ? "⛔"
              : report.state === "prompt"
                ? "○"
                : "…"}
      </span>
      <span className="capability-row__name">
        {CAPABILITY_LABELS[name] ?? name}
      </span>
      <span className="capability-row__state">
        {STATE_LABELS[report.state]}
      </span>
    </li>
  );
}

export function CapabilityStatus() {
  const caps = useCapabilities();

  const entries = Object.entries(caps) as Array<[string, CapabilityReport]>;
  const allAvailable = entries.every(([, r]) => r.state === "available");
  const hasIssues = entries.some(
    ([, r]) => r.state === "unavailable" || r.state === "denied",
  );

  return (
    <section className="capability-status" aria-label="Device capabilities">
      <h2 className="capability-status__heading">Device capabilities</h2>
      {hasIssues ? (
        <p className="capability-status__warning" role="status">
          Some capabilities are unavailable. The app may have limited
          functionality.
        </p>
      ) : null}
      <ul className="capability-status__list">
        {entries.map(([name, report]) => (
          <CapabilityRow key={name} name={name} report={report} />
        ))}
      </ul>
      {allAvailable ? (
        <p className="capability-status__ok" role="status">
          All capabilities available.
        </p>
      ) : null}
    </section>
  );
}
