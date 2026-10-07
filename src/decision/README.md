# `decision/` — reconciliation & decision engine

The arbiter. Combines the Safety Engine's assessment with the Navigation
Engine's route intent and the current Scene Representation, and decides what (if
anything) to tell the user.

**Responsibilities (future phases)**

- Reconcile route instruction, position, heading, visible obstacles,
  traversable path, and safety level into a single coherent decision.
- Enforce priority: **safety outranks navigation convenience.** A stop/caution
  from [`safety/`](../safety/README.md) overrides a "turn/continue" from
  [`navigation/`](../navigation/README.md).
- Decide messaging cadence (avoid overwhelming the user; suppress redundant
  repeats) and hand structured instructions to [`speech/`](../speech/README.md).
- Degrade gracefully: when perception is unavailable/stale, say so rather than
  implying the way is clear.

**Rules**

- The LLM never drives this layer and never triggers arbitrary app actions.
  Decisions come from validated, structured inputs via explicit logic.
- Deterministic and testable; no direct I/O or provider SDK calls.
