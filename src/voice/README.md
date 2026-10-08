# `voice/` — voice input

Captures spoken user input via the browser's `SpeechRecognition` API, with a
text fallback for unsupported browsers or denied microphone permissions.

## Modules

| File              | Purpose                                                   |
| ----------------- | --------------------------------------------------------- |
| `voice-input.ts`  | `VoiceInput` class: push-to-talk + text fallback          |
| `index.ts`        | Barrel exports                                            |

## Responsibilities

- Wrap the browser `SpeechRecognition` API (including `webkitSpeechRecognition`
  vendor prefix) behind a clean interface.
- Provide push-to-talk semantics: the user explicitly starts and stops
  listening. **No always-listening microphone behavior.**
- Offer `submitText()` as a fallback when voice is unsupported or denied.
- Expose `subscribe`/`getSnapshot` for React's `useSyncExternalStore`.
- Handle permission denial and API unavailability as first-class states.

## Rules

- Never listen without explicit user action (push-to-talk only).
- Never store or transmit audio recordings.
- Degrade gracefully: if `SpeechRecognition` is unavailable, the text fallback
  is the only input method.
