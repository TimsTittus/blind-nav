# `speech/` — audio output (primary user channel)

Turns the Decision Engine's structured instructions into spoken output. For the
target user, **audio is the primary interface**; visual UI is secondary.

**Responsibilities (future phases)**

- Speak instructions (Web Speech API `speechSynthesis` to start) with sensible
  prioritization: safety-critical utterances interrupt/queue ahead of routine
  guidance.
- Avoid spam: de-duplicate and rate-limit repeated messages.
- Expose status for screen readers via ARIA live regions so announcements work
  even without TTS, and never depend on color or purely visual cues.
- Handle unsupported/unavailable speech synthesis and microphone-permission
  denial (for future voice input) as explicit, announced states.

**Rules**

- Speech **renders** decisions; it never makes navigation or safety decisions.
- Keep it swappable (browser TTS now; other engines later) behind a small
  interface.
