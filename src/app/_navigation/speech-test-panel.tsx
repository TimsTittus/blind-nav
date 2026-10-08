"use client";

import { useSpeech } from "@/speech";

interface SpeechTestPanelProps {
  onClose: () => void;
}

interface TestPhrase {
  readonly text: string;
  readonly priority: "information" | "navigation" | "high" | "critical";
}

const TEST_PHRASES: TestPhrase[] = [
  { text: "Path clear. Continue straight.", priority: "information" },
  { text: "Puddle ahead. Stay to the right.", priority: "navigation" },
  { text: "Obstacle ahead. Move left.", priority: "high" },
  { text: "STOP. Danger directly ahead.", priority: "critical" },
  { text: "Turn right in 20 meters.", priority: "navigation" },
];

export function SpeechTestPanel({ onClose }: SpeechTestPanelProps) {
  const speech = useSpeech();

  return (
    <aside
      className="debug-overlay"
      aria-label="Speech engine testing controls"
    >
      <div className="debug-overlay__header">
        <h2>Speech test (dev only)</h2>
        <button type="button" className="control-button" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="debug-overlay__status">
        {speech.isSupported ? "TTS supported" : "TTS not supported"}
        {" · "}
        {speech.isSpeaking ? "Speaking" : "Idle"}
        {speech.isPaused ? " (paused)" : ""}
      </p>
      <div className="speech-test__phrases">
        {TEST_PHRASES.map((phrase) => (
          <button
            key={phrase.text}
            type="button"
            className={`control-button control-button--small speech-test__btn--${phrase.priority}`}
            onClick={() => speech.speak(phrase.text, phrase.priority)}
          >
            [{phrase.priority}] {phrase.text}
          </button>
        ))}
      </div>
      <div className="speech-test__controls">
        <button
          type="button"
          className="control-button control-button--small"
          onClick={speech.stop}
        >
          Stop speech
        </button>
        <button
          type="button"
          className="control-button control-button--small"
          onClick={speech.isPaused ? speech.resume : speech.pause}
        >
          {speech.isPaused ? "Resume" : "Pause"}
        </button>
      </div>
      <fieldset className="speech-test__settings">
        <legend>Voice settings</legend>
        <label>
          Rate: {speech.settings.rate.toFixed(1)}
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.1"
            value={speech.settings.rate}
            onChange={(e) =>
              speech.updateSettings({ rate: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Pitch: {speech.settings.pitch.toFixed(1)}
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={speech.settings.pitch}
            onChange={(e) =>
              speech.updateSettings({ pitch: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Volume: {speech.settings.volume.toFixed(1)}
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={speech.settings.volume}
            onChange={(e) =>
              speech.updateSettings({ volume: Number(e.target.value) })
            }
          />
        </label>
      </fieldset>
    </aside>
  );
}
