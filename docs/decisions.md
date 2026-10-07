# Architecture Decision Records

Lightweight ADRs. Each records a decision, its context, and its consequences.
Newest decisions are appended; superseded ones are marked, not deleted.

Format: **Status** · **Context** · **Decision** · **Consequences**.

---

## ADR 0001 — Browser prototype first (Next.js), before hardware

**Status:** Accepted (2026-10-07)

**Context.** The long-term product is a wearable (vest-mounted camera) assistive
navigation system. Committing to hardware/mobile first would couple us to device
and platform concerns before the software architecture — perception, safety,
navigation, decision-making, speech — is proven. The hard problems are
architectural, not mechanical.

**Decision.** Build a **browser-based prototype first** to establish the complete
software architecture. The browser gives us camera, geolocation, device
orientation, and speech synthesis behind standard web APIs, so we can prototype
the full pipeline without hardware. Hardware/mobile follows once the
architecture is validated.

**Consequences.**

- Fast iteration; no device toolchain required to make progress.
- We must treat browser APIs as one (replaceable) input source, not as the
  permanent foundation — layer boundaries must not leak browser specifics.
- Some wearable concerns (power, mounting, offline CV) are explicitly deferred.

---

## ADR 0002 — Next.js with a strict client/server separation

**Status:** Accepted (2026-10-07)

**Context.** We need a browser UI, a place to run secrets-bearing AI calls, and a
single toolchain for both. The target user relies on audio and accessibility, so
first-class SSR/HTML and good a11y defaults matter.

**Decision.** Use **Next.js (App Router)**. The browser handles capture,
sensors, UI, and speech. **Server route handlers** (`src/app/api/**`) are the
only place that holds API keys and talks to AI providers. The client never calls
a provider directly.

**Consequences.**

- API keys stay server-side; they are never shipped to the browser and never use
  the `NEXT_PUBLIC_` prefix.
- One repo, one language (TypeScript), one build for client and server.
- We accept a running server component for the prototype; a future hardware
  build may relocate the "server" role on-device.
- No premature microservices — a single app with clear internal layers.

---

## ADR 0003 — Replaceable AI vision provider abstraction

**Status:** Accepted (2026-10-07)

**Context.** Gemini is the first vision model, but the system must be able to
adopt OpenRouter models, local object detection, semantic segmentation, depth
estimation, or dedicated CV models later — possibly on-device.

**Decision.** Define one narrow **`VisionProvider` interface** in
[`src/providers`](../src/providers). Perception depends only on that interface.
Concrete providers (Gemini first) implement it and normalize their output into
the shared Scene Representation.

**Consequences.**

- Providers are swappable without touching perception, safety, navigation, etc.
- Each provider must map its output into the `core` schema and is responsible for
  its own failure typing.
- Slight upfront indirection — justified by the explicit requirement that the
  model be replaceable. We avoid over-abstracting beyond this one seam.

---

## ADR 0004 — Structured AI output, validated with Zod

**Status:** Accepted (2026-10-07)

**Context.** LLM output is untrusted and can be malformed, hallucinated, or
shaped unexpectedly. This system makes guidance decisions for a user who may not
be able to visually sanity-check them.

**Decision.** All AI output uses **structured JSON** and is validated with **Zod**
at the boundary before any layer consumes it. The application **never trusts
arbitrary model-generated JSON**. `core` Zod schemas are the single source of
truth, reused for all external data (model output, browser APIs, network).

**Consequences.**

- Malformed/invalid output becomes a handled failure state, not a crash or a bad
  decision.
- Schemas double as TypeScript types (one definition, no drift).
- Validation has a cost per response; acceptable and bounded by throttling.

---

## ADR 0005 — Safety engine is separate from, and independent of, the LLM

**Status:** Accepted (2026-10-07)

**Context.** Using a generative model as the collision-safety mechanism is
unsafe: it is non-deterministic, can hallucinate, and cannot be audited. Yet the
system's purpose is obstacle awareness for someone who may not see hazards.

**Decision.** Keep a **separate, deterministic Safety Engine**
([`src/safety`](../src/safety)) that evaluates the validated Scene Representation
with explicit, auditable rules. It does not ask a model whether something is
safe. Missing/stale/low-confidence/ambiguous perception is treated as degraded /
unsafe — never as "clear". Safety can override navigation guidance.

**Consequences.**

- Safety behavior is testable and reviewable (same input → same output).
- The LLM is confined to *describing* the scene (perception), not *deciding*
  risk or actions.
- This remains an assistive prototype and still carries no guarantee of
  collision avoidance; the engine reduces, not eliminates, risk, and must never
  claim otherwise.

---

## ADR 0006 — Multi-rate, cancellable pipeline with no stale overwrites

**Status:** Accepted (2026-10-07)

**Context.** Sending every camera frame to a remote AI is slow, costly, and
unnecessary. Overlapping async calls risk an older response overwriting a newer
analysis.

**Decision.** Enforce `camera FPS > local processing frequency > AI analysis
frequency`. AI calls are **throttled/debounced** and **cancellable**, and each
carries a monotonic sequence/generation token so a stale response is discarded
when a newer one has already been applied.

**Consequences.**

- Bounded cost and latency; local processing can fill gaps between AI calls.
- Requires disciplined lifecycle handling (abort on unmount, tab-visibility
  changes, session cancellation).

---

## ADR 0007 — Privacy by default: no frame storage, no telemetry

**Status:** Accepted (2026-10-07)

**Context.** Camera frames of a user's surroundings are sensitive. The user may
be unable to visually audit what is captured or sent.

**Decision.** Camera frames are **processed transiently and not stored** by
default. **No analytics or telemetry** unless explicitly required and documented.
Secrets live only on the server.

**Consequences.**

- Less debugging data by default; we add opt-in, documented diagnostics only
  when truly needed.
- Simpler privacy posture and smaller attack surface.

---

## ADR 0008 — Pin TypeScript to the 5.9 line (below the TS 7 native port)

**Status:** Accepted (2026-10-07)

**Context.** At setup, npm's `latest` TypeScript is **7.0.2**, the new native
(Go) compiler. However, `typescript-eslint@8` — pulled in by
`eslint-config-next` for typed linting — declares peer support for
`typescript >=4.8.4 <6.1.0`. Using TS 6.1+/7 risks broken or unsupported typed
linting, which conflicts with our rule that lint + typecheck must pass cleanly.

**Decision.** Pin **TypeScript `5.9.3`** (caret `^5.9.3`, which stays `<6.0`),
the latest line fully supported across the current lint/build toolchain.

**Consequences.**

- Clean, supported `lint` + `typecheck` + `build`.
- We forgo the newest compiler for now. Upgrading to TS 6/7 is a tracked future
  task, gated on `typescript-eslint` support and Next's guidance.

---

## ADR 0009 — Tooling: Bun, ESLint flat config + jsx-a11y, Prettier, Vitest

**Status:** Accepted (2026-10-07)

**Context.** We need a consistent, enforceable toolchain supporting strict
TypeScript, accessibility linting, formatting, and fast unit tests, matching the
engineering rules (strict mode, no `any`, validate external data, handle edge
states).

**Decision.**

- **Bun** as the package manager and script runner (fast installs, single tool;
  `bun.lock` as the lockfile). Native postinstall scripts are blocked by default,
  so build-requiring packages are listed under `trustedDependencies` in
  `package.json` (currently `unrs-resolver`, used by ESLint's TS import
  resolver). Next.js still runs on the Node runtime it targets.
- **ESLint 10 flat config** composing `eslint-config-next` (brings
  `eslint-plugin-jsx-a11y`, React, hooks) + `eslint-config-next/typescript` +
  `eslint-config-prettier`, with `@typescript-eslint/no-explicit-any` as an
  error.
- **Prettier** for formatting (ESLint not used as a formatter).
- **Vitest** + Testing Library + jsdom for unit/component tests.
- **TypeScript strict** plus `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noUnusedLocals/Parameters`, and
  `verbatimModuleSyntax`.

**Consequences.**

- Accessibility regressions are caught at lint time where statically detectable.
- Stricter compiler settings surface bugs early at the cost of occasional extra
  annotations — an acceptable trade for an assistive system.
- Vitest shares Vite config/ESM ergonomics with the front end and runs fast.
