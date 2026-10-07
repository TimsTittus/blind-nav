# `core/` — shared domain contracts

Framework-agnostic domain model shared across all layers. This is where the
**Scene Representation** and other cross-layer types/Zod schemas will live.

**Responsibilities (future phases)**

- Canonical TypeScript types for the domain (scene, obstacle, path, pose,
  heading, route step, safety level, confidence, timestamps/freshness).
- Zod schemas that are the single source of truth for validating any data that
  crosses a trust boundary (model output, browser APIs, network responses).
- Small pure helpers over those types (no I/O, no React, no provider SDKs).

**Rules**

- No dependency on React, Next, the DOM, or any provider SDK.
- Every externally-sourced value is parsed through a Zod schema here before any
  other layer consumes it. Layers depend on `core`, never the reverse.
- Represent uncertainty explicitly: freshness/age, confidence, and an explicit
  "unavailable / stale / ambiguous" state are part of the model, not afterthoughts.
