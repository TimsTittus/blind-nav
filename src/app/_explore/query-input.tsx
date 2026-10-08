"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import type { VoiceInput, VoiceInputState } from "@/voice";

export interface QueryInputProps {
  voiceInput: VoiceInput;
  onSubmit: (question: string) => void;
  disabled: boolean;
}

const VOICE_LABEL: Record<VoiceInputState, string> = {
  idle: "Hold to ask",
  listening: "Listening…",
  processing: "Processing…",
  unsupported: "Voice unavailable",
  denied: "Mic denied",
  error: "Voice error",
};

export function QueryInput({
  voiceInput,
  onSubmit,
  disabled,
}: QueryInputProps) {
  const voiceState = useSyncExternalStore(
    voiceInput.subscribe,
    voiceInput.getSnapshot,
    voiceInput.getSnapshot,
  );

  const [textInput, setTextInput] = useState("");

  const handlePushStart = useCallback(() => {
    if (disabled) return;
    voiceInput.startListening();
  }, [voiceInput, disabled]);

  const handlePushEnd = useCallback(() => {
    voiceInput.stopListening();
  }, [voiceInput]);

  const handleTextSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const q = textInput.trim();
      if (q.length === 0 || disabled) return;
      voiceInput.submitText(q);
      onSubmit(q);
      setTextInput("");
    },
    [textInput, disabled, voiceInput, onSubmit],
  );

  const canPush =
    voiceInput.isSupported &&
    voiceState !== "denied" &&
    voiceState !== "listening" &&
    !disabled;

  return (
    <div className="query-input" role="group" aria-label="Ask a question">
      <button
        type="button"
        className="query-input__push-to-talk control-button"
        onPointerDown={handlePushStart}
        onPointerUp={handlePushEnd}
        onPointerCancel={handlePushEnd}
        disabled={!canPush}
        aria-label={VOICE_LABEL[voiceState]}
        aria-pressed={voiceState === "listening"}
      >
        {VOICE_LABEL[voiceState]}
      </button>

      <form
        className="query-input__text-form"
        onSubmit={handleTextSubmit}
        aria-label="Text question"
      >
        <label htmlFor="explore-question" className="visually-hidden">
          Type a question
        </label>
        <input
          id="explore-question"
          type="text"
          className="query-input__text-field"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="Type a question…"
          autoComplete="off"
          disabled={disabled}
        />
        <button
          type="submit"
          className="control-button control-button--small"
          disabled={disabled || textInput.trim().length === 0}
        >
          Ask
        </button>
      </form>
    </div>
  );
}
