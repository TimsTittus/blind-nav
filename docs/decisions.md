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

---

## ADR 0018 — Phase 5: speech engine with priority queue and swappable TTS

**Status:** Accepted (2026-10-08)

**Context.** Audio is the primary interface for the target user. The system
needs spoken output with priority-based interruption (safety-critical messages
must pre-empt routine guidance), duplicate suppression (identical instructions
must not repeat excessively), and a swappable TTS backend (browser
`SpeechSynthesis` first, native mobile or cloud TTS later).

**Decision.**

- **Five speech priorities** (`critical` > `high` > `navigation` >
  `information` > `low`) in `core/speech.ts`, separate from the four-level
  decision `Priority`. The `SpeechInstruction` schema uses the speech-specific
  set. Interruption rules: critical can interrupt anything; high can interrupt
  navigation/information/low; navigation can interrupt low; information and low
  cannot interrupt.
- **`TtsProvider` interface** in `src/speech/tts-provider.ts` (`speak`, `stop`,
  `pause`, `resume`, `isSpeaking`, `isSupported`, `onEnd`, `onError`).
  `WebTtsProvider` wraps browser `SpeechSynthesis`; future implementations can
  be swapped without touching callers.
- **`SpeechQueue`** — priority-ordered, FIFO within same priority, returns an
  interrupt signal on enqueue.
- **`DuplicateSuppression`** — per-text cooldowns keyed by priority (3–15 s).
  Prevents spam from repeated identical messages (e.g. "Path clear" produced
  10 times in 5 seconds).
- **`SpeechEngine`** — orchestrator composing queue + suppression + provider.
  Event-driven: speaks only when a new instruction arrives, not continuously.
  `speak(text, priority)` / `stop()` / `pause()` / `resume()` / `dispose()`.
- **Voice settings** (rate, pitch, volume, enabled) persisted in `localStorage`
  with safe-range clamping and graceful fallback for unavailable storage.
- **React hook** `useSpeech()` creates the engine on mount, disposes on unmount,
  and syncs settings and state.
- **No speech recognition.** Microphone input (voice commands, destination input)
  is explicitly deferred to a later phase.
- **Dev panel.** A `SpeechTestPanel` (dev-only, dead-code-eliminated in prod)
  fires five test phrases (`"Path clear"`, `"Puddle ahead"`, `"Obstacle ahead"`,
  `"STOP"`, `"Turn right in 20 meters"`) at their priorities, with pause/stop
  and voice-settings controls.

**Consequences.**

- The speech engine is ready for the Decision Engine to drive with
  `SpeechInstruction`s; until then, it is invoked via the dev panel or
  programmatically.
- The voice toggle in the navigation UI now controls the real engine.
- Screen-reader announcements (ARIA live regions) remain independent of TTS —
  they work even when speech is disabled or unsupported.

---

## ADR 0019 — Phase 6: navigation engine (location, heading, routing, route tracking)

**Status:** Accepted (2026-10-08)

**Context.** The system needs GPS-based location tracking, heading awareness,
destination selection, walking route acquisition, and turn-by-turn route state
to feed the Decision Engine. These are separate from visual perception and must
not depend on a specific routing provider. The browser Geolocation API provides
location; device orientation and GPS course provide heading. Tests must not
depend on live GPS.

**Decision.**

- **Location state machine.** Seven explicit states (`unsupported`,
  `permission_required`, `permission_denied`, `acquiring`, `active`, `error`,
  `stale`) modeled as a pure transition table, driven by `LocationController`
  wrapping browser `watchPosition`/`clearWatch`. A stale timer transitions to
  `stale` after 15 s without a new position. The Geolocation dependency is
  injectable for testability — tests use a `fakeGeolocation()` helper.
- **Heading resolution.** GPS course heading and device orientation heading are
  modeled as separate inputs. `resolveHeading()` picks the freshest source and
  tags the result with `HeadingSource` (`gps` | `device_orientation` |
  `unknown`). The core `HeadingStateSchema` gained a required `source` field.
- **Geo-math.** Haversine distance, bearing, and perpendicular distance to a
  segment are pure functions in `geo-math.ts`, used by the route tracker and
  off-route detection.
- **`RoutingProvider` abstraction.** `geocode(query)` → `GeocodingResult[]` and
  `getWalkingRoute(origin, destination)` → `Route`. Provider-agnostic; the first
  implementation is a dev-only `FixtureRoutingProvider` with three NYC fixture
  destinations and interpolated walking routes. A live backend (Google
  Directions, Mapbox, etc.) can be added behind the same interface later.
  OpenStreetMap's public tile/API infrastructure is not used as an unrestricted
  production routing backend.
- **`RouteTracker`.** Tracks navigation progress against a `Route`: step
  progression (advances when within a configurable threshold of a step's end
  coordinate), off-route detection with a configurable distance threshold and
  a debounce window (prevents false positives from GPS jitter), arrival
  detection (within threshold of destination), and fractional progress
  reporting.
- **Core schema additions.** `core/navigation.ts` gained `HeadingSourceSchema`,
  `address` on `DestinationSchema`, `bearing` on `RouteStepSchema`, and
  `origin`/`totalDurationSeconds` on `RouteSchema`.
- **React hook.** `useLocation()` creates a `LocationController` on mount,
  disposes on unmount, and exposes the snapshot via `useSyncExternalStore`.
- **Not yet in the UI.** The navigation engine is wired and unit-tested but
  not mounted in `/navigate` — UI integration belongs with the Safety Engine
  or Decision Engine phase, which needs location and route context.

**Consequences.**

- Location, heading, routing, and route tracking are testable independently with
  deterministic fake inputs (no live GPS, no network).
- The `RoutingProvider` abstraction makes the routing backend replaceable;
  switching providers requires no changes to the route tracker, decision engine,
  or UI.
- Off-route detection debouncing prevents noisy GPS from generating false
  re-route prompts.
- The navigation state feeds into the Decision Engine (future phase), which
  reconciles it with safety and perception to produce spoken instructions.

---

## ADR 0020 — Phase 7: deterministic safety engine with five levels, actions, fusion, and expiry

**Status:** Accepted (2026-10-08)

**Context.** The architecture mandates a separate, deterministic Safety Engine
that evaluates structured perception data with auditable rules and never asks a
model "is this safe?" ([ADR 0005](decisions.md)). The Phase-1 `SafetyLevel` set
(`clear`/`caution`/`stop`/`unknown`) was a placeholder; the UI already added a
`DANGER` category between `CAUTION` and `CRITICAL` (ADR 0015 noted the mapping
would be revisited). The engine must combine perception, location, heading,
route, and the current route step into a conservative assessment with an
expiration time.

**Decision.**

- **Evolve `core/safety.ts`.** Replace the four-level `SafetyLevelSchema` with
  five levels: `unknown` < `safe` < `caution` < `danger` < `critical` (`clear`
  → `safe`, `stop` → `critical`, `danger` added). Add `SafetyActionSchema`
  (`none`, `continue`, `continue_cautiously`, `slow_down`, `move_left`,
  `move_right`, `stop`). Extend `SafetyAssessmentSchema` with `action`,
  `confidence` (0–1), and `expiresAt`.
- **Deterministic rules (`src/safety/rules.ts`).** Obstacle evaluation uses
  position × distance × severity. Hazard evaluation uses position × severity.
  Path status maps directly. Unknown distance is conservatively treated as
  `near`; unknown severity as `medium`. Multiple signals are aggregated by
  worst-signal. Conflicting obstacles (near on both left and right) → DANGER +
  STOP. Uncertainty and low confidence promote safe → caution.
- **Navigation fusion (`src/safety/fusion.ts`).** If the current route step is
  a turn toward a blocked direction (near + high severity obstacle), the engine
  suppresses the route instruction and returns a `FusionOverride`. The engine
  never invents an alternative route.
- **Assessment expiry.** Every assessment carries `expiresAt` (default 3 s
  TTL). `SafetyEngine.isExpired()` checks; after expiry the assessment must be
  treated as `unknown`.
- **Staleness.** Perception older than 10 s → `unknown`. Location older than
  15 s → assessment marked `degraded` (informational). Thresholds are
  configurable via `SafetyConfig`.
- **No AI, no network.** The engine is pure: same input → same output, no model
  calls, no side effects.
- **Tests.** 73 table-driven test cases covering all severity combinations,
  positions, distances, stale perception, conflicting obstacles, navigation
  fusion, assessment expiry, low confidence, ambiguous availability, and edge
  cases.

**Consequences.**

- The `core` safety schema changed (five levels, new fields). All consumers
  (session factory, UI status mapping, mock scenarios, existing tests) were
  updated. The UI `StatusCategory` ↔ `SafetyLevel` mapping is now nearly 1:1
  (`safe` + `degraded` → `UNKNOWN`; `danger` → `DANGER`).
- The engine is ready for the Decision Engine to consume. It is not yet mounted
  in the UI; the Decision Engine phase will wire it.
- This remains an assistive prototype and carries no guarantee of collision
  avoidance — the engine reduces, not eliminates, risk.

---

## ADR 0021 — Phase 8: decision engine with NavigationSessionController and real-time pipeline

**Status:** Accepted.

**Context:** Phases 1–7 built every subsystem in isolation: camera, perception,
safety, navigation, speech. Each has its own controller, state, and tests. The
Navigation Mode UI used mock scenarios and a dev logging consumer. No subsystem
was wired to another at runtime. To deliver the end-to-end prototype we need an
orchestration layer that starts every subsystem, feeds frames through the
pipeline, runs safety assessment, dispatches speech, and tears everything down
on stop.

**Decision:** Create a `NavigationSessionController` class in `src/decision`
that owns the full lifecycle. Key design choices:

1. **Controller, not React.** The orchestration lives in a plain TypeScript
   class, not inside React components. React observes state via
   `useSyncExternalStore`; it never creates or disposes subsystems directly.
2. **One pipeline, one owner.** The controller creates all subsystems on
   `start()` and tears them all down on `stop()` or `dispose()`. No subsystem
   outlives the session.
3. **SpeechDispatch as a separate concern.** Safety-to-speech and route-to-speech
   mapping is isolated in `SpeechDispatch` with its own cooldown and duplicate
   suppression logic, independent of the `SpeechEngine`'s own queue.
4. **Perception freshness.** Four states (fresh/aging/stale/none) with
   configurable thresholds, tracked by the controller and exposed in the
   snapshot.
5. **Safety re-evaluation loop.** Assessments are re-run on new perception
   data and on a periodic interval matching the TTL, so expired assessments
   degrade promptly.
6. **Graceful degradation.** Camera failure doesn't crash the session; the
   safety engine treats absent perception as `unknown`; speech dispatch
   announces degradation.
7. **Mock scenarios preserved.** The debug overlay retains the scenario
   selector for testing without real hardware.

**Consequences:**

- The full camera → AI → safety → speech pipeline is wired end-to-end. With
  a Gemini API key and browser permissions, the prototype delivers real-time
  spoken navigation guidance.
- The `SpeechTestPanel` now creates its own `useSpeech()` instance for
  independent testing; it no longer shares the session's speech engine.
- The view model gained `buildRealViewModel` alongside the existing
  `buildViewModel` (mock scenarios). The debug overlay shows FPS, AI request
  count, perception freshness, GPS accuracy, and speech status.
- `DebugInfo` grew five new fields; existing tests pass because `buildViewModel`
  provides defaults.
- 30 new tests (13 speech dispatch, 17 controller integration). Total: 456.

---

## ADR 0022 — Phase 9: Navigation Mode, Explore Mode, voice input, and scene queries

**Status:** Accepted.

**Context:** Phase 8 wired the real-time pipeline but only Navigation Mode was
functional, and only with a basic destination text field. Explore Mode was a
placeholder. Users had no way to ask questions about their environment, and there
was no voice input.

**Decision:**

1. **Voice input** (`src/voice`): `VoiceInput` class wrapping the browser
   `SpeechRecognition` API with vendor prefix detection, push-to-talk semantics
   (not always-listening), and `submitText` text fallback. Standard
   `subscribe`/`getSnapshot` pattern.
2. **Scene query pipeline**: extend `VisionProvider` with an optional
   `queryScene(input, options)` method that returns concise free-form text.
   Implement in Gemini (separate system instruction for short answers) and
   fixture provider. New `POST /api/vision/query` server endpoint. Browser-side
   `SceneQueryClient` + `SceneQueryHandler` (integrated into
   `NavigationSessionController` via `submitQuery`).
3. **Session creator improvements**: recent destinations stored in
   `localStorage` (max 5, no auth/cloud), selectable via buttons. Submit label
   changes per mode.
4. **Explore Mode** (`src/app/_explore`): `ExploreScreen` with camera viewport,
   safety indicator, push-to-talk + text input, query status display. Shares
   `NavigationSessionController` (no destination/route). `QueryInput` component.
5. **Navigation Mode**: now complete with destination input flow.
6. **Controller updates**: `NavigationSessionController` gains `submitQuery`,
   `cancelQuery`, and `query` in the snapshot. `SceneQueryHandler` created and
   disposed as part of the subsystem lifecycle.

**Consequences:**

- Both product modes are functional end-to-end.
- `VisionProvider` has an optional `queryScene` method; providers that don't
  implement it return an `unsupported_feature` error from the endpoint.
- Explore Mode does not use routing or destination — it is pure obstacle/
  environment awareness plus user queries.
- Recent destinations use browser `localStorage` only — no auth, no cloud
  storage. Unavailable storage is silently skipped.
- Voice input is push-to-talk only — no always-listening microphone behavior.
- 37 new tests (20 voice input, 10 scene query handler, 7 query contract).
  Total: 493.

---

## ADR 0023 — Phase 10: performance profiling and optimization

**Status:** Accepted.

**Context:** Phases 1–9 built all subsystems end-to-end. Before adding new AI
models or further features, the system needs measurement infrastructure to
identify bottlenecks and verify that nothing leaks, duplicates requests, or
degrades over time. The task explicitly defers new AI models and local CV.

**Decision:**

1. **`PerformanceMonitor`** (`src/performance`): development-only metrics
   collector tracking cameraFPS, captureLatencyMs, aiLatencyMs,
   aiRequestsPerMinute, aiFailureRate, perceptionAgeMs, gpsAccuracy, gpsAgeMs,
   speechQueueLength, and endToEndLatencyMs. All data stays in-process — no
   external telemetry. Bounded at 300 timestamp entries with periodic pruning
   (30 s interval). Integrated into `NavigationSessionController` with metric
   recording at each pipeline stage.
2. **Memory audit.** `DuplicateSuppression.cooldowns` Map was unbounded — now
   pruned every 30 s via a timer in `SpeechEngine` (the `prune()` method
   existed but was never called). `SpeechEngine.dispose()` clears the timer.
   All other subsystems' cleanup patterns were audited and found sound:
   `CameraController` (token invalidation, track stop on all exit paths),
   `PerceptionController` (abort + dispose), `FrameScheduler` (generation
   invalidation), `SceneQueryHandler` (abort + listener clear).
3. **Network verification.** Confirmed: `PerceptionController` enforces one
   request in flight with latest-frame-wins (pending slot). Timeouts and
   abort signals are wired at every layer. No concurrent request explosion is
   possible.
4. **Image optimization.** `FrameCapture` now detects WebP support at startup
   and prefers `image/webp` encoding (smaller payloads for the same quality).
   Falls back to JPEG where the browser lacks WebP canvas encoding. Detection
   result is cached per session. Camera orientation is already handled natively
   by the `<video>` element (no extra transform needed).
5. **AI optimization.** Already optimized: `temperature: 0`,
   `thinkingBudget: 0`, structured JSON output (`responseSchema`). No
   navigation history or previous frames are sent (confirmed by code audit).
6. **Benchmark.** A Vitest-based benchmark exercises the fixture provider,
   safety engine, and full pipeline with timing instrumentation. Sub-
   millisecond results for all stages with fixture data.

**Consequences:**

- A `PerformanceMonitor` is available for any dev or debugging session;
  `controller.getPerformanceMetrics()` returns the latest snapshot.
- No behavior changes: the system produces identical outputs. The optimization
  is measurement infrastructure + one leak fix + one image encoding improvement.
- 24 new tests (17 performance monitor, 4 benchmark, 3 frame-capture WebP).
  Total: 517.


---

## ADR 0024 — Phase 11: evaluation framework

**Status:** Accepted.

**Context:** The prototype has a complete real-time pipeline but no systematic
way to verify quality beyond "it seemed to work." Before field testing or
expansion, the system needs objective, repeatable evaluation: defined expected
outcomes per scenario, explicit scoring for the failure modes that matter most
(false negatives in safety), and automated regression coverage for every layer.

**Decision:**

1. **Fixture scenes expanded from 6 to 16** (`src/providers/fixture/fixtures.ts`).
   Ten new scenes added: `clear_road`, `pothole`, `parked_vehicle`,
   `moving_person`, `stairs_up`, `curb`, `wall`, `narrow_path`,
   `road_crossing`, `low_light`. Each scene encodes its ground-truth
   `SceneObservation` and corresponds to a real-world pedestrian situation.

2. **Evaluation framework** (`src/evaluation/`): shared types and helpers
   (`types.ts`, `helpers.ts`), a `summarize()` function that tallies TP/FP/FN/TN
   and computes precision, recall, and FN-rate, and a `SAFETY_FLOOR` table
   mapping every fixture scene to its minimum acceptable `SafetyLevel`.

3. **Seven test categories:**
   - Categories 1 & 2 (scene understanding / object detection): sceneType,
     pathStatus, terrain, obstacle and hazard presence, zero false negatives.
   - Category 3 (safety decision): every scene meets its safety floor; critical
     scenes (`wall`, `blocked`, `stairs*`, `road_crossing`, `pothole`) are never
     assessed as safe.
   - Categories 4 & 5 (navigation instruction / speech behavior): dispatch
     priority by safety level, queue ordering, interruption rules, duplicate
     suppression, stop/disable controls.
   - Category 6 (latency): p95 thresholds — fixture analyze <20 ms, safety assess
     <5 ms, speech dispatch <2 ms, combined pipeline <30 ms.
   - Category 7 (failure handling): 10 failure scenarios each verified to return
     a typed `AppError` with `perceptionStatus: "unavailable"`.

4. **Security tests:** API key not in `NEXT_PUBLIC_` scope; malicious/oversized
   payloads; oversized image (>4 MB → 400); invalid MIME; malformed JSON; Zod
   schema rejects adversarial model output.

5. **Privacy tests:** no frames stored in `localStorage`; `fetch` only goes to
   the internal `/api/vision/analyze` endpoint; no image data in console output;
   no GPS coordinates in console output or performance metrics.

6. **No behavior changes.** All new code is test infrastructure or fixture data.
   The evaluation framework never runs in the production bundle.

**Consequences:**

- Every fixture scene is an explicit regression anchor. Changing fixture output
  now fails a test before any downstream layer is affected.
- False negative rate is tracked numerically. The current result is 0 across
  all 16 scenes for both detection and safety decision categories.
- 84 new tests (categories 1–7, security, privacy). Total: 601.
- `docs/testing.md` and `docs/evaluation.md` provide reference material for
  contributors and reviewers.

---

## ADR 0025 — Phase 12: installable PWA, capability detection, and mobile UI

**Status:** Accepted.

**Context:** The prototype runs end-to-end in a desktop browser but has no PWA
infrastructure (no manifest, no service worker, no icons), no runtime capability
detection, and no mobile-specific UI optimizations. Before field testing on real
devices the app must be installable, must clearly communicate which device
capabilities are available, and must make the STOP control easy to reach
one-handed.

**Decision:**

1. **PWA manifest and service worker.** `public/manifest.json` with standalone
   display, `any` orientation, theme color matching dark/light schemes, and
   SVG + PNG icons (192, 512, apple-touch 180). A minimal `public/sw.js`
   using network-first strategy with a shell cache for the three app routes.
   Service worker is registered from a client component on mount. `next.config.ts`
   adds no-cache headers for the service worker and a `Service-Worker-Allowed`
   header.

2. **Layout metadata.** `layout.tsx` gains `manifest`, `appleWebApp`,
   `mobile-web-app-capable` metadata, `viewportFit: "cover"` for notched
   devices, dual `themeColor` for dark/light, and `<link>` tags for the SVG
   favicon and apple-touch-icon.

3. **Capability detection layer** (`src/capabilities/`). Five detectors:
   `CameraCapability`, `LocationCapability`, `SpeechCapability`,
   `MicrophoneCapability`, `OrientationCapability`. Each returns a
   `CapabilityReport` with state (`checking | available | unavailable |
   denied | prompt`) and a human-readable reason. `detectAll()` runs them in
   parallel. `useCapabilities()` hook with permission-change re-detection.

4. **Capability status UI.** `CapabilityStatus` component on the home page
   showing each capability's state with a visual indicator. Warns when
   capabilities are unavailable or denied.

5. **Install prompt.** `InstallPrompt` component captures
   `beforeinstallprompt`, shows an install button when available, and detects
   standalone mode. Hidden in standalone mode via CSS.

6. **Mobile UI optimizations.**
   - STOP button: full-width, placed first (top of controls) on narrow
     portrait screens (≤ 480 px), minimum 80 px tall.
   - `touch-action: manipulation` on all buttons to prevent double-tap zoom.
   - 1 rem gap between session controls to prevent accidental adjacent taps.
   - `env(safe-area-inset-*)` padding for notched/gestured devices.
   - Light-theme STOP button gets a box-shadow for outdoor visibility.
   - Standalone PWA hides the install prompt and tightens nav padding.

7. **No changes to core logic.** Perception, safety, navigation, decision,
   and speech engines are unchanged.

**Consequences:**

- The app is installable as a PWA on Android Chrome and as an Add-to-Home-Screen
  app on iOS Safari. Desktop Chrome/Edge also support install.
- Users see upfront which capabilities their device supports before starting a
  session. Denied permissions are clearly reported.
- The STOP button is always reachable one-handed on mobile. Touch targets exceed
  WCAG minimums.
- `docs/pwa.md` documents browser support, permissions, and known limitations.
- No new runtime dependencies. The service worker is a plain JS file.
- Firefox mobile and iOS Safari have known limitations (no `SpeechRecognition`,
  no `beforeinstallprompt` on iOS). These are documented and reported to the
  user via the capability status panel.

---

## ADR 0026 — Phase 13: local CV evaluated as a spike; not integrated

**Status:** Accepted.

**Context:** Cloud AI (Gemini) adds latency and a network dependency to
obstacle awareness. Phase 13 asked for an evaluation of local computer vision
(object detection, semantic segmentation, monocular depth, optionally geometry)
for fast questions — something ahead, blocked, sidewalk, stairs, large obstacle,
traversable — without integrating a model into the navigation loop or replacing
Gemini. SeaFormer was suggested for segmentation but was not to be assumed best.

**Decision:**

1. **Isolate the work in `spikes/local-cv/`** with its own dependencies,
   tsconfig and `bun test`; exclude `spikes/` from the root tsconfig and ESLint.
   Production code and the root quality gate are unchanged.
2. **Use ONNX Runtime** (Node for benchmarks; onnxruntime-web for WASM/WebGPU)
   as the single runtime, because every candidate has ONNX weights and ORT-Web
   offers WebGPU with a CPU (WASM) fallback behind one API.
3. **Evaluate on 40 CC-licensed photos** covering all 16 fixture scenes, hand-
   labelled for the six questions, and score local output through the real
   `SafetyEngine` against the Phase-11 `SAFETY_FLOOR`. Thresholds for rule v1
   were fixed before scoring; rule v2 was designed after seeing v1 failures and
   is reported as optimistic.
4. **Recommend SeaFormer-S as the candidate for local fast perception** on
   latency, memory and stairs accuracy, with blocked/large-obstacle detection
   explicitly _not_ ready.
5. **Keep Gemini as the only provider in the loop.** A future
   `HybridVisionProvider` must follow the asymmetric merge prototyped in
   `spikes/local-cv/src/hybrid.ts`: local evidence may only add risk.
6. **Reject on license grounds** AGPL detectors (Ultralytics YOLO family) and
   CC-BY-NC depth weights (Depth Anything V2 Base/Large). Flag SegFormer
   (NVIDIA non-commercial) and all ADE20K-trained weights for legal review.

**Consequences:**

- No behaviour change in the app; no new production dependency.
- The `VisionProvider` interface fits a local provider unchanged, but a local
  provider would live client-side, unlike today's server-only providers.
- Any integration is gated on: phone + real-GPU WebGPU measurements, a held-out
  target-viewpoint dataset (collected with consent), a better approach to
  "blocked" (temporal smoothing, orientation-sensor ground geometry, or
  fine-tuning), and the weights license review.
- `docs/pwa.md` was corrected in the same change: its browser matrix had been
  labelled "tested" without real-device testing and described behaviour the
  code does not have.

---

## ADR 0027 — Phase 14: local perception integrated behind a trust policy and an asymmetric merge

**Status:** Accepted.

**Context:** ADR 0026 evaluated local computer vision and recommended **not**
integrating it, gating any integration on phone measurements, a weights licence
review, a held-out dataset and a better approach to the "blocked" question.
Phase 14 was nevertheless specified: integrate the selected model, keep Gemini
working, run local perception faster than the cloud, normalise its output, and
fuse the two sources without automatically preferring either.

Those gates are **not** met, and this ADR does not claim otherwise. The
integration is therefore built so that the unmet gates constrain what the
feature can do, rather than being deferred to a later cleanup:

- No weights are committed or deployed, so the licence question is untouched.
- The feature is inert unless a developer installs a model.
- The questions Phase 13 measured as unreliable cannot raise a stop.
- Local evidence is structurally incapable of lowering risk.

**Decision:**

1. **A new `fast-perception` layer** (`src/fast-perception/`) owns local
   inference. Model-specific shapes — tensors, class indices, ADE20K label
   strings — stop there. Everything above consumes the normalized
   `FastPerceptionFrame` contract in `core/fast-perception.ts`
   (`FastObstacle { type, region, confidence, movement }`, plus six tri-state
   answers where `null` means "cannot say" and is never read as "no").
2. **A `LocalVisionBackend` seam** keeps the runtime replaceable.
   `OnnxVisionBackend` (onnxruntime-web 1.30, WebGPU → WASM) is the first
   implementation, imported dynamically so a cloud-only build never downloads
   it. `RecordedVisionBackend` replays recorded grids for deterministic tests.
3. **`onnxruntime-web` becomes a production dependency**, and `next.config.ts`
   sets COOP/COEP so multi-threaded WASM works. The app loads no cross-origin
   resources today, so the isolation cost is currently zero; adding any will
   require CORP/`crossorigin` handling.
4. **Weights are configuration, absent by default.** `public/models/` is
   gitignored and populated by `bun run models:install`. A missing model is a
   first-class `unavailable` state surfaced in the capability panel, never a
   silent degradation.
5. **A `FastTrustPolicy` governs what local evidence may claim**, keyed to the
   per-question reliability Phase 13 measured. The shipped default lets
   `stairs`, `somethingAhead` and `largeObstacle` raise risk only as far as
   `partially_blocked` (→ `caution`); `blocked` (precision 0.13) is recorded but
   **may not force a stop**; `sidewalk` and `traversable` can never escalate at
   all, whatever a policy says.
6. **A new `fusion` layer** merges the sources asymmetrically: local evidence may
   only add risk, absence of evidence is `unknown` rather than `clear`, and the
   cloud keeps sole authority over description, terrain, scene type and
   recommended action. Disagreements are **retained** as `conflicts`, resolved
   only by "took the more cautious reading" — never by preferring a source.
7. **The Safety Engine stays the only component that decides risk**, and learns
   nothing about computer vision: it receives a flat `PerceptionFusionInput`
   (`localOnly`, `conflicts`). Conflicted or local-only perception is never
   reported as `safe` and is always `degraded` — but is not escalated to a stop,
   because over-stopping teaches users to ignore the system.
8. **The local loop self-paces.** `FrameScheduler` gained a dynamic interval, and
   the controller raises its interval so inference never occupies more than
   `1 / backoffFactor` of wall-clock time. 150 ms (≈6.7 FPS) is a starting
   target, explicitly not a validated or safe one.
9. **A speech rate gate** in the session controller holds back repeats of an
   already-announced safety level until the cooldown elapses, because
   `SpeechDispatch` intentionally announces `danger`/`critical` immediately and
   a 7 Hz loop would otherwise spam the user. Level *changes* still pass through
   at once.
10. **`HybridVisionProvider`** composes a cloud provider with
    `LocalVisionProvider` at the interface level, giving the three comparison
    arms the brief asked for. The live pipeline does not use it: the two loops
    run at different frequencies and are fused by the session controller, so
    neither blocks the other.

**Consequences:**

- Default behaviour is unchanged. With no weights installed the app is
  cloud-only. `public/models/` is gitignored, so a clean checkout (and therefore
  any CI or production build from git) contains no weights, and `next build`
  copies nothing from `public/` into `.next`. A deploy that rsyncs a developer's
  working tree *would* carry locally installed weights — `models:install` is a
  development convenience, not a deployment step.
- Measured: hybrid matches cloud-only on floor compliance (16/16), adds no new
  false stops, and surfaces 4 conflicts cloud-only cannot see; local-only misses
  4 of 16 scenes and is not viable alone.
- Verified with real weights through the production backend on real photos
  (~104–138 ms, WASM single-thread, laptop). Still unmeasured: **any phone**,
  real-GPU WebGPU, CPU/GPU utilisation, memory and battery.
- The ADR 0026 gates remain open and now also gate turning
  `allowBlockedAssertion` on. `docs/fast-perception.md` §9 tracks them.
- New production dependency and app-wide response headers are the real costs of
  this phase.

## ADR 0028 — Phase 15: CameraSource abstraction and hardware roadmap

**Date:** 2026-10-09

**Status:** Accepted

**Context:**

The system currently couples frame acquisition to the browser's `getUserMedia`
API: `CameraController` owns a `MediaStream`, `FrameCapture` reads pixels from
an `HTMLVideoElement`, and the perception pipeline receives browser-encoded
`CapturedFrame` objects. This works for the browser prototype but blocks any
move to non-browser cameras: a USB UVC module, a CSI sensor on a Raspberry Pi,
a Jetson's MIPI input, or a React Native camera bridge.

Phase 15's brief asks for a `CameraSource` abstraction so the perception
pipeline does not care where frames came from, a normalized `CameraFrame` that
carries no browser-specific objects, and documentation of future hardware
options without making a hardware choice.

**Decision:**

1. **A `CameraSource` interface** (`src/camera/source.ts`) defines the
   source-agnostic contract: `start`, `stop`, `pause`, `resume`,
   `captureFrame(signal?)`, `subscribe`/`getSnapshot`. Implementations declare
   their `kind` (`"browser"`, `"mobile"`, `"external"`, `"fixture"`,
   `"unknown"`).
2. **`CameraFrame`** is a Zod-validated value object carrying `id`, `timestamp`,
   `width`, `height`, `orientation` (`landscape | portrait | unknown`),
   `source` (the source kind), and `data` (a `Blob`). No `MediaStream`, no
   `HTMLVideoElement`, no `HTMLCanvasElement`.
3. **`BrowserCameraSource`** adapts the existing `CameraController` +
   `FrameCapture` to the new interface. It is the only code that touches
   `getUserMedia`, `MediaStream`, or `HTMLVideoElement`. Everything above it sees
   `CameraFrame`.
4. **`MobileCameraSource` and `ExternalCameraSource` are declared as planned**
   but not implemented. They exist only in the interface's JSDoc and in
   `docs/hardware-roadmap.md`. No code is written for them until the
   corresponding hardware path is chosen.
5. **`docs/hardware-roadmap.md`** evaluates five hardware options (phone on
   vest, phone + USB camera, Raspberry Pi, Jetson Orin, Android wearable) across
   nine criteria, documents how each connects to the existing software layers,
   and explicitly states that no hardware is chosen.
6. **The existing session controller and perception pipeline are not modified.**
   The abstraction sits alongside the current code; migrating the session
   controller to use `CameraSource` instead of `CameraController` directly is a
   separate, future step that should happen only once `CameraSource` has been
   proven with at least two implementations.

**Consequences:**

- The browser prototype is completely unaffected: `BrowserCameraSource` wraps
  the exact same code paths.
- Future hardware work has a clear integration seam: implement `CameraSource`,
  plug it in. No changes to safety, fusion, speech, or decision.
- The `CameraFrame` schema is validated with Zod, consistent with the project's
  "validate everything external" rule.
- The hardware roadmap is a living document, not a decision — it will be updated
  as real-device measurements, user research, and cost constraints arrive.
