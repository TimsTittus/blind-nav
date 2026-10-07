# `safety/` — deterministic safety engine

A **separate, deterministic** layer that evaluates the Scene Representation and
assigns a safety assessment. Intentionally independent of the generative AI
model.

**Responsibilities (future phases)**

- Derive a safety level from the validated scene using explicit, auditable
  rules (not model free-text).
- Treat missing, stale, low-confidence, or ambiguous perception as **unsafe /
  degraded**, never as "clear". Silence is never interpreted as safety.
- Produce caution/stop signals that the Decision Engine must respect and that
  can override navigation guidance.

**Rules**

- The LLM is **not** the collision-safety mechanism. This engine does not ask a
  model whether something is safe; it applies deterministic logic to structured
  data.
- Pure and testable: same input → same output, no network, no side effects.
- This is an assistive prototype. It does **not** guarantee obstacle or
  collision avoidance and must never claim to.
