# `perception/` — turning sensor input into a Scene Representation

Converts raw input (camera frames; later depth/other sensors) into the
validated **Scene Representation** defined in [`core/`](../core/README.md).

**Responsibilities (future phases)**

- Orchestrate frame sampling and the multi-rate pipeline:
  `camera FPS > local processing frequency > AI analysis frequency`.
- Drive the active vision provider via the abstraction in
  [`providers/`](../providers/README.md) and validate every result with Zod.
- Manage concurrency: throttle/debounce AI calls, make them cancellable, and
  guarantee an **older response can never overwrite a newer one** (sequence/
  generation tokens).
- Emit explicit freshness and availability so downstream layers can tell a
  "clear path" from "we don't currently know".

**Rules**

- Perception **describes**; it never decides what the user should do.
- The AI provider is replaceable (Gemini today; OpenRouter / local object
  detection / segmentation / depth later) behind one interface.
- Camera frames are processed transiently and not persisted (see privacy rules
  in [`docs/architecture.md`](../../docs/architecture.md)).
