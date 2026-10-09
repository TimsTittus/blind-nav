"use client";

import { useState } from "react";
import { useCapabilities } from "@/capabilities";
import type { CapabilityReport, CapabilityState } from "@/capabilities";
import { requestCapabilityPermission } from "@/capabilities/permissions";

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
  onRequestPermission,
  isRequesting,
}: {
  name: string;
  report: CapabilityReport;
  onRequestPermission?: (name: string) => void;
  isRequesting?: boolean;
}) {
  const canRequest =
    report.state === "prompt" &&
    (name === "location" || name === "camera" || name === "microphone");

  return (
    <li className={`capability-row capability-row--${report.state}`}>
      <div className="capability-row__header">
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
        {canRequest && onRequestPermission ? (
          <button
            type="button"
            className="capability-row__action"
            disabled={isRequesting}
            onClick={() => onRequestPermission(name)}
            aria-label={`Enable ${CAPABILITY_LABELS[name] ?? name}`}
          >
            {isRequesting ? "Prompting…" : "Enable"}
          </button>
        ) : null}
      </div>
      {report.reason && report.state !== "available" ? (
        <p className="capability-row__reason">{report.reason}</p>
      ) : null}
    </li>
  );
}

export function CapabilityStatus() {
  const caps = useCapabilities();
  const [requesting, setRequesting] = useState<string | null>(null);

  const handleRequestPermission = async (name: string) => {
    setRequesting(name);
    try {
      await requestCapabilityPermission(name);
    } finally {
      setRequesting(null);
    }
  };

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
          <CapabilityRow
            key={name}
            name={name}
            report={report}
            onRequestPermission={handleRequestPermission}
            isRequesting={requesting === name}
          />
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
