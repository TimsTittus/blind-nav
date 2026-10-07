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

---

## ADR 0010 — Domain model lives in `core` as Zod schemas (single source of truth)

**Status:** Accepted (2026-10-07)

**Context.** Phase 1 needs the canonical domain model (session, scene,
obstacle, safety, navigation, decision, speech). The architecture also mandates
that every value crossing a trust boundary is validated with Zod and that types
never drift from validation.

**Decision.** Define each domain type as a **Zod schema in `src/core`** and
derive the TypeScript type via `z.infer`. Schemas are the single source of
truth; the barrel `@/core` is the only import surface. The task's suggested
`src/lib/*` / `src/types` layout was **not** adopted — CLAUDE.md's layered
structure (`core ← providers/perception/safety/navigation → decision → speech →
app`) governs, and domain types belong in `core`.

**Consequences.**

- One definition per concept; validation and types cannot diverge.
- Uncertainty is encoded in the model itself (explicit `availability`,
  `confidence`, `degraded`, and `"unknown"` members), not bolted on later.
- Layer-type ownership is unambiguous: `SafetyAssessment`/`NavigationDecision`
  types live in `core`; the engines that produce them live in their own layers.

---

## ADR 0011 — Client-held session: memory + `sessionStorage`, no Zustand, no DB

**Status:** Accepted (2026-10-07)

**Context.** A run needs session state (mode, destination, latest inputs) that
survives client-side route changes. The task listed Zustand "only where client
state is actually required" and forbade a database and unnecessary state
libraries.

**Decision.** Keep the session **client-held**: pure factory/transitions in
`core`, a small external store read via **`useSyncExternalStore`**, and
**`sessionStorage`** for persistence (validated with Zod on every read; invalid
data is dropped, never trusted). No Zustand and no database were added — the
standard React primitive covers this need without a dependency, and
`sessionStorage` (not `localStorage`) matches the transient, privacy-first
nature of a navigation run.

**Consequences.**

- No new runtime dependency; behaviour is driven by the tested `core` helpers.
- SSR-safe (`getServerSnapshot`) with no effect-driven `setState`.
- State is per-tab and transient by design; durable/multi-device persistence is
  explicitly out of scope.

---

## ADR 0012 — Typed application error taxonomy with a serialisable wire form

**Status:** Accepted (2026-10-07)

**Context.** The architecture requires failure modes (permission denial,
unavailability, timeout, network, AI error, invalid model response, unsupported
feature) to be represented explicitly, and errors must be able to cross the
client/server boundary (route handler → browser).

**Decision.** Define an `AppError` base with a stable `code` discriminant and
concrete subclasses in `core/errors.ts`, plus a Zod-validated
`SerializedAppError` form with `toSerializedAppError` / `fromSerializedAppError`.
`InvalidModelResponseError.fromZodError` bridges failed model-output validation.

**Consequences.**

- Callers branch on `code`/`instanceof` and `retryable` instead of string
  matching.
- Errors survive JSON transport and are reconstructed as typed errors.
- The taxonomy is shared (one source of truth); provider code re-exports the
  AI-relevant members rather than redefining them.

---

## ADR 0013 — Playwright for end-to-end testing (separate from Vitest)

**Status:** Accepted (2026-10-07)

**Context.** Unit tests (Vitest) cover `core`/schemas/session, but the
accessible shell (keyboard operability, skip link, session flow, emergency
stop) needs browser-level verification.

**Decision.** Add **Playwright** with `testDir: ./e2e`, a `webServer` that boots
`bun run dev`, and a `test:e2e` script. Browsers are not bundled
(`bunx playwright install chromium` is run once). E2E stays separate from the
Vitest suite, which remains scoped to `src/**`.

**Consequences.**

- Accessibility affordances are exercised in a real browser.
- E2E is intentionally excluded from `bun run check` (no browser download in the
  fast gate); run it explicitly with `bun run test:e2e`.

---

## ADR 0014 — Retain accessibility-first CSS; defer Tailwind and shadcn/ui

**Status:** Accepted (2026-10-07)

**Context.** The Phase 1 task suggested Tailwind CSS and shadcn/ui. The Phase 0
foundation deliberately uses hand-written, accessibility-first CSS (custom
properties, visible focus rings, skip link, reduced-motion, no colour-only
meaning), and the Phase 1 UI is only minimal placeholder pages.

**Decision.** For this phase, **keep the existing accessibility-first CSS** and
do **not** add Tailwind or shadcn/ui (confirmed with the requester). Revisit and
add them via a future ADR if and when richer UI justifies the dependency and
build change.

**Consequences.**

- No new styling dependencies or build changes; the deliberate a11y-first base
  is preserved and extended for the shell.
- If adopted later, base styles will need migration; that cost is deferred until
  there is real UI to benefit from it.

---

## ADR 0015 — Phase 2 is the Navigation Mode UI; provider harness moves to Phase 3

**Status:** Accepted (2026-10-07)

**Context.** The roadmap listed the mock `VisionProvider` + route handler as
Phase 2. The requested Phase 2 is instead an audio-first Navigation Mode UI with
mocked state.

**Decision.** Build the UI first (`src/app/_navigation`), with UI-level status
categories (adds DANGER between `caution` and `stop`; `core` is unchanged until
the Safety Engine exists) and mock scenarios. Debug tooling is gated by an
inlined `process.env.NODE_ENV` check in the component module so production
bundles exclude it. The mock-provider/route-handler work shifts to Phase 3.

**Consequences.** The UI can be exercised in every state before real inputs
exist. The `StatusCategory` ↔ `SafetyLevel` mapping must be revisited in the
Safety Engine phase.

---

## ADR 0016 — Phase 3 is the browser camera subsystem; provider harness moves to Phase 4

**Status:** Accepted (2026-10-07)

**Context.** The roadmap planned the mock `VisionProvider` + route handler for
Phase 3 and camera capture for Phase 4. The requested Phase 3 is the camera
subsystem alone (no Gemini, GPS, or routing).

**Decision.**

- Add `src/camera` as a client-only input layer (controller, capture,
  scheduler, consumer, hooks). It is framework-agnostic at its core so lifecycle
  logic is unit-testable without React or a real camera (dependencies such as
  `mediaDevices` and visibility are injectable).
- **Pause keeps the stream but disables tracks** (`track.enabled = false`)
  rather than releasing it, for instant resume. Tab-hidden and user-PAUSE are
  independent pause reasons. `stop()` always releases tracks.
- **Frames are binary `Blob`s** encoded via canvas; no base64 on the client.
  The scheduler does not await the consumer, so a slow consumer cannot delay
  capture; backpressure is the consumer's job (perception will drop stale work
  with sequence tokens).
- The frame loop runs **only in development** with the logging consumer; there
  is no point capturing in production until a real consumer exists.
- Camera state is not folded into `core` `PerceptionStatus`/safety: a live
  camera says nothing about obstacles, so safety stays UNKNOWN.
- Provider harness moves to Phase 4 and is combined with wiring the pipeline.

**Consequences.** Real-camera behaviour varies by browser (see
`src/camera/README.md`); E2E uses a canvas-backed mock stream and injected
failures instead of hardware.

---

## ADR 0017 — Phase 4: server-side Gemini vision pipeline (provider + route + harness)

**Status:** Accepted (2026-10-07)

**Context.** Phase 4 connects the camera frame pipeline to AI vision:
`camera frame → server → Gemini → validated SceneAnalysis`. The roadmap split
this across Phases 4–5 (mock provider/route, then the real Gemini provider); the
requested Phase 4 merges them. It must keep API keys server-side, validate
everything external, represent uncertainty and failure explicitly, prevent stale
overwrites, and remain perception-only (no safety, navigation, GPS, routing,
speech, or local CV).

**Decision.**

- **Evolve the Scene Representation.** The Phase-1 placeholder `SceneAnalysis` /
  `Obstacle` in `core` are replaced with the conservative Phase-4 design:
  categorical enums throughout (`sceneType`, `pathStatus`, `terrain`,
  obstacle `position` / `relativeDistance` / `severity` / `movement`, `hazards`,
  `recommendedImmediateAction`, `uncertainty`), a `Hazard` type, and a
  model-output subset `SceneObservation` that normalizes into a server-stamped
  `SceneAnalysis` (`analysisId`, `capturedAt`, `analyzedAt`, derived
  `availability`, `provider`). `core` stays the single source of truth
  ([ADR 0010](decisions.md)).
- **No precise distance.** There is no depth sensor, so the schema has **no**
  meters field; obstacles carry only a relative-distance *category*. The system
  must never fabricate a numeric distance.
- **`recommendedImmediateAction` is a hint, not a command.** The LLM remains an
  observation component ([ADR 0005](decisions.md)); the future deterministic
  Safety Engine owns risk and user-facing action.
- **Official SDK.** The Gemini provider uses `@google/genai`
  (`ai.models.generateContent`) with structured JSON output
  (`responseMimeType` + `responseSchema` via the `Type` enum), inline base64
  image input, `temperature: 0`, disabled thinking, and a combined
  timeout/abort signal. Output is re-validated with Zod regardless.
- **Secrets stay server-only.** The Gemini provider (and the key) are reachable
  only from the route handler via a server module; the `@/providers` barrel does
  not export it, so no client bundle can import the SDK or key.
- **One request in flight.** A client `PerceptionController` issues at most one
  analysis at a time, coalescing newer frames into a single pending slot, with a
  monotonic sequence and a pure reducer that drops any result older than the one
  already applied — an old response can never overwrite newer state.
- **Honest failure.** Every failure maps to the typed error taxonomy (extended
  with `rate_limited` and `invalid_image`), returns
  `perceptionStatus: "unavailable"`, and clears the last analysis. Failure is
  never a silent "path clear".
- **Fixtures, not live UI wiring.** A dev-only fixture provider (clear / puddle /
  obstacle / stairs / blocked / uncertain) lets the whole pipeline run with no
  key. The pipeline is wired to the camera at the `FrameConsumer` seam and fully
  unit-tested, but it is **not** mounted into the live `/navigate` UI this phase:
  that couples perception to the still-mocked navigation/safety and changes a
  run's privacy posture (frames would leave the device), which belongs with the
  Safety Engine and an explicit consent decision.

**Consequences.**

- The architecture's perception seam is real and testable end-to-end without an
  API key, a camera, or the network (Gemini is mocked in unit tests).
- The `core` scene schema changed shape; the only consumers were the schema
  tests and the provider return type, both updated.
- Mounting perception in the UI, and the `StatusCategory`/`SafetyLevel` mapping,
  remain for the Safety Engine phase. See [`docs/gemini.md`](gemini.md) for
  configuration.

