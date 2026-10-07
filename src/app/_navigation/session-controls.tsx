import { EmergencyStop } from "../_components/emergency-stop";

export interface SessionControlsProps {
  voiceEnabled: boolean;
  paused: boolean;
  onToggleVoice: () => void;
  onTogglePause: () => void;
  onStop: () => void;
}

/** VOICE / PAUSE / STOP. State is mocked; voice does not speak yet. */
export function SessionControls({
  voiceEnabled,
  paused,
  onToggleVoice,
  onTogglePause,
  onStop,
}: SessionControlsProps) {
  return (
    <div
      className="session-controls"
      role="group"
      aria-label="Session controls"
    >
      <button
        type="button"
        className="control-button"
        aria-pressed={voiceEnabled}
        aria-label="Voice guidance"
        onClick={onToggleVoice}
      >
        VOICE
        <span className="control-button__state">
          {voiceEnabled ? "On" : "Off"}
        </span>
      </button>
      <button
        type="button"
        className="control-button"
        aria-pressed={paused}
        aria-label="Pause guidance"
        onClick={onTogglePause}
      >
        PAUSE
        <span className="control-button__state">
          {paused ? "Paused" : "Running"}
        </span>
      </button>
      <EmergencyStop onStop={onStop} label="STOP" />
    </div>
  );
}
