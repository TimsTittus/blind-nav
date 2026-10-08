# `decision/` — reconciliation & decision engine

The arbiter. Combines the Safety Engine's assessment with the Navigation
Engine's route intent and the current Scene Representation, and decides what (if
anything) to tell the user.

## Modules

| File                               | Purpose                                                      |
| ---------------------------------- | ------------------------------------------------------------ |
| `config.ts`                        | Tunable constants (analysis interval, freshness thresholds)  |
| `types.ts`                         | `SessionControllerSnapshot`, `PerceptionFreshness`, etc.     |
| `speech-dispatch.ts`               | Maps safety assessment + route state to speech calls         |
| `navigation-session-controller.ts` | Main orchestrator: camera → perception → safety → speech     |
| `index.ts`                         | Barrel exports                                               |

## Responsibilities

- Orchestrate the real-time pipeline: camera capture → AI analysis →
  safety assessment → speech output.
- Enforce priority: **safety outranks navigation convenience.** A stop/caution
  from [`safety/`](../safety/README.md) overrides a "turn/continue" from
  [`navigation/`](../navigation/README.md).
- Decide messaging cadence (avoid overwhelming the user; suppress redundant
  repeats) and hand structured instructions to [`speech/`](../speech/README.md).
- Degrade gracefully: when perception is unavailable/stale, say so rather than
  implying the way is clear.
- Own every subsystem lifecycle. React observes state; it never creates or
  disposes subsystems.

## Rules

- The LLM never drives this layer and never triggers arbitrary app actions.
  Decisions come from validated, structured inputs via explicit logic.
- Deterministic and testable; no direct I/O or provider SDK calls (those live
  in `perception/` and `providers/`).
- One AI request in flight at a time; latest-frame-wins. Stale responses
  are discarded via monotonic sequence tokens.
