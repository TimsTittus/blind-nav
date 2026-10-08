# `safety/` — deterministic safety engine

A **separate, deterministic** layer that evaluates the Scene Representation and
assigns a safety assessment. Intentionally independent of the generative AI
model. See [`docs/safety-engine.md`](../../docs/safety-engine.md) for the full
rules reference.

## Modules

| File                | Purpose                                                |
| ------------------- | ------------------------------------------------------ |
| `config.ts`         | Tunable constants (staleness thresholds, TTL)          |
| `types.ts`          | `SafetyContext`, `ThreatSignal`, `FusionOverride`      |
| `rules.ts`          | Deterministic obstacle/hazard/path → threat evaluation |
| `fusion.ts`         | Navigation instruction suppression when hazards exist  |
| `safety-engine.ts`  | `SafetyEngine` — main entry point: `assess(context)`  |
| `index.ts`          | Barrel exports                                         |

## Usage

```ts
import { SafetyEngine, type SafetyContext } from "@/safety";

const engine = new SafetyEngine();
const result = engine.assess(context);
// result.assessment — SafetyAssessment (level, action, reasons, …)
// result.fusionOverride — null or { suppressedInstruction, reason }

if (engine.isExpired(result.assessment, Date.now())) {
  // treat as UNKNOWN
}
```

## Rules

- The LLM is **not** the collision-safety mechanism. This engine does not ask a
  model whether something is safe; it applies deterministic logic to structured
  data.
- Pure and testable: same input → same output, no network, no side effects.
- Missing, stale, low-confidence, or ambiguous perception is **degraded / unsafe**,
  never "clear". Silence is never interpreted as safety.
- Safety can override navigation guidance via fusion.
- This is an assistive prototype. It does **not** guarantee obstacle or
  collision avoidance and must never claim to.
