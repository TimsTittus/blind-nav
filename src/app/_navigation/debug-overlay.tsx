import { MOCK_SCENARIOS } from "./mock-scenarios";
import type { DebugInfo } from "./view-model";

export interface DebugOverlayProps {
  info: DebugInfo;
  scenarioId: string;
  onScenarioChange: (id: string) => void;
  onClose: () => void;
}

function formatTime(value: number | null): string {
  return value === null ? "never" : new Date(value).toISOString();
}

/** Development-only. Holds no secrets: only session and mock-state values. */
export function DebugOverlay({
  info,
  scenarioId,
  onScenarioChange,
  onClose,
}: DebugOverlayProps) {
  const rows: [string, string][] = [
    ["Session ID", info.sessionId],
    ["Mode", info.mode],
    ["Perception", info.perception],
    ["GPS", info.gps],
    ["AI", info.ai],
    ["Safety level", info.safetyLevel],
    ["Last analysis", formatTime(info.lastAnalysisAt)],
    [
      "Analysis latency",
      info.latencyMs === null ? "n/a" : `${info.latencyMs} ms`,
    ],
  ];
  return (
    <aside className="debug-overlay" aria-label="Developer debug information">
      <div className="debug-overlay__header">
        <h2>Debug (dev only)</h2>
        <button type="button" className="control-button" onClick={onClose}>
          Close debug
        </button>
      </div>
      <dl>
        {rows.map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="field">
        <label htmlFor="mock-scenario">Simulated scenario</label>
        <select
          id="mock-scenario"
          value={scenarioId}
          onChange={(event) => onScenarioChange(event.target.value)}
        >
          {MOCK_SCENARIOS.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.label}
            </option>
          ))}
        </select>
      </div>
    </aside>
  );
}
