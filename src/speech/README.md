# `speech/` — audio output (primary user channel)

Turns structured instructions into spoken output. For the target user, **audio is
the primary interface**; visual UI is secondary.

## Status

**Phase 5 — implemented.** Browser `SpeechSynthesis` via a swappable
`TtsProvider` interface. Priority queue with interruption, duplicate suppression
with per-priority cooldowns, voice settings persisted to `localStorage`.

## What's here

| File                      | Purpose                                                    |
| ------------------------- | ---------------------------------------------------------- |
| `config.ts`               | Priority ranks, cooldown durations, voice-settings shape   |
| `tts-provider.ts`         | Abstract `TtsProvider` interface + helpers                  |
| `web-tts-provider.ts`     | Browser `SpeechSynthesis` implementation                   |
| `speech-queue.ts`         | Priority-ordered queue with interruption rules             |
| `duplicate-suppression.ts`| Per-text cooldowns to suppress repeated messages            |
| `preferences.ts`          | Load/save `VoiceSettings` from `localStorage`              |
| `speech-engine.ts`        | Main orchestrator (queue + suppression + provider)          |
| `use-speech.ts`           | React hook (`useSpeech`)                                   |
| `index.ts`                | Barrel exports                                             |

## Priority levels

| Priority      | Rank | Can interrupt                            |
| ------------- | ---- | ---------------------------------------- |
| `critical`    | 0    | Everything                               |
| `high`        | 1    | `navigation`, `information`, `low`       |
| `navigation`  | 2    | `low`                                    |
| `information` | 3    | Nothing                                  |
| `low`         | 4    | Nothing                                  |

## Duplicate suppression

Each spoken text starts a per-priority cooldown. If the same text is submitted
again within the cooldown window, it is silently dropped. Cooldowns range from
3 s (critical) to 15 s (low).

## Rules

- Speech **renders** decisions; it never makes navigation or safety decisions.
- The `TtsProvider` interface is the swap point: browser TTS now, native mobile
  TTS or cloud TTS later.
- Voice settings (rate, pitch, volume, enabled) are persisted in `localStorage`.
