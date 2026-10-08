# Architecture

Status: **Phase 9 (Navigation Mode + Explore Mode complete)**; Phase 8 added the
decision engine / real-time pipeline, Phase 7 the deterministic safety engine,
Phase 6 the navigation engine, Phase 5 the speech engine, Phase 4 the
server-side Gemini vision pipeline, Phase 3 the browser camera subsystem,
Phase 2 the mocked Navigation Mode UI, and Phase 1 the core domain model. This
document describes the target software architecture the prototype is being built
toward. The `core` domain model + Zod schemas exist (the Scene Representation is
now the conservative Phase-4 shape), along with a concrete **Gemini
`VisionProvider`** + dev fixtures (now with `queryScene` for free-form
questions), the server **analyze and query routes**, a client **perception
pipeline** (analysis client, scene query client, single-in-flight controller
with no stale overwrites, camera→perception bridge), a **speech engine**
(`src/speech`) with a priority queue, interruption rules, duplicate suppression,
and voice-settings persistence, a **navigation engine** (`src/navigation`) with
location tracking, heading resolution, geo-math, a `RoutingProvider`
abstraction, turn-by-turn `RouteTracker` with off-route detection and arrival, a
**deterministic safety engine** (`src/safety`) with five safety levels, obstacle
and hazard evaluation rules, navigation fusion, assessment expiry, and
configurable staleness thresholds, a **decision engine** (`src/decision`) with a
`NavigationSessionController` that orchestrates the full real-time pipeline, a
**voice input** abstraction (`src/voice`) with browser SpeechRecognition and text
fallback, a **scene query pipeline** (VoiceInput → question → SceneQueryHandler
→ VisionProvider → speech), and both **Navigation Mode** and **Explore Mode** UIs
fully wired to real state with destination management and push-to-talk queries.

## 1. Goals and non-goals

**Goals**

- Establish the complete software architecture in a browser prototype before any
  move to mobile / wearable hardware.
- Keep perception, safety, navigation, decision-making, speech, and UI as
  **separate, replaceable** concerns.
- Make the AI vision provider swappable (Gemini today; others later).
- Validate all external and model-produced data before trusting it.
- Represent uncertainty and failure explicitly.

**Non-goals (now)**

- Not the final hardware/vest system.
- Not a certified safety-critical, medical, or mobility device.
- No guarantee of obstacle or collision avoidance.

## 2. Core principle

> The generative AI model is **not** the collision-safety mechanism.

Perception (which may use an LLM) only **describes** the world as structured,
validated data. A separate, deterministic **Safety Engine** evaluates that data.
The LLM never directly controls navigation and never triggers arbitrary
application actions.

## 3. Layered pipeline

```
Camera (+ future sensors)
      │
      ▼
Perception Layer ─────────── uses ──▶ Providers (replaceable AI vision)
      │                                   (server-only; Zod-validated)
      ▼
Scene Representation  (core/ types + Zod schemas; carries confidence + freshness)
      │
      ├───────────────▶ Safety Engine        (deterministic, LLM-independent)
      │                       │
GPS / Route (separate input)  │
      │                       ▼
Navigation Engine ─────▶ Decision Engine   (reconciles; safety outranks nav)
                              │
                              ▼
                        Speech Engine        (primary output) ──▶ User
                              │
                              ▼
                        UI (secondary, accessible)
```

Key separations:

- **Perception vs. Safety.** Perception describes; Safety decides risk with
  auditable rules. Safety never asks a model "is this safe?".
- **Vision vs. GPS/route.** Visual perception and route/position are separate
  inputs, reconciled only in the Decision Engine — never blended upstream.
- **Decision vs. everything.** Only the Decision Engine turns inputs into
  user-facing intent, and it enforces that **safety outranks navigation
  convenience**.

## 4. Layer responsibilities

Each layer has a README with detail. Summary:

| Layer                          | Responsibility                                                   | Depends on          |
| ------------------------------ | ---------------------------------------------------------------- | ------------------- |
| [`core`](../src/core)          | Domain types + Zod schemas (Scene Representation); pure helpers   | —                   |
| [`providers`](../src/providers)| `VisionProvider` interface + concrete providers (server-only)     | core                |
| [`perception`](../src/perception)| Frames → validated scene; multi-rate pipeline; concurrency       | core, providers     |
| [`safety`](../src/safety)      | Deterministic safety assessment from scene + navigation context   | core                |
| [`navigation`](../src/navigation)| Route/GPS/position/heading reasoning                             | core                |
| [`decision`](../src/decision)  | Reconcile safety + navigation + scene → decision & cadence        | core, safety, navigation |
| [`speech`](../src/speech)      | Speak decisions; prioritize safety; duplicate suppression; swappable TTS | core          |
| [`app`](../src/app)            | UI + server route handlers (`app/api/**`)                         | all                 |

Dependencies point **toward `core`**; lower layers never import UI.

## 5. Client / server boundary

- **Client (browser):** camera capture, Geolocation, device orientation,
  speech output, UI. Owns device permissions and their denied/error states.
- **Server (route handlers in `src/app/api/**`):** the only place that holds API
  keys and calls AI providers. The browser sends a frame (+ minimal context) to
  an internal endpoint; the server calls the provider, validates the result, and
  returns structured JSON.
- **Rule:** API keys are server-only env vars, never `NEXT_PUBLIC_*`, never in
  client bundles.

## 6. AI provider abstraction

- One narrow `VisionProvider` interface in [`providers`](../src/providers):
  input a frame (+ context) → output a **validated** partial Scene
  Representation or a typed failure.
- First implementation (Phase 4, done): **Google Gemini** via the official
  `@google/genai` SDK (`ai.models.generateContent`), using **structured JSON
  output** (`responseSchema`) and inline base64 image input, re-parsed with Zod.
  A dev-only **fixture provider** implements the same interface for keyless runs.
  See [`docs/gemini.md`](gemini.md).
- Future implementations behind the same interface: OpenRouter models, local
  object detection, semantic segmentation, depth estimation, dedicated CV
  models — swappable without changing callers.
- **The application never trusts arbitrary model JSON.** Unvalidated or
  malformed output is a handled failure state.

## 7. Scene Representation

The contract between perception and the rest of the system. It will (in later
phases) carry at least:

- structured obstacles / traversable-path description,
- per-item and overall **confidence**,
- **freshness**: capture timestamp + age, and a provider/analysis id,
- an explicit **availability** state: `ok | stale | unavailable | ambiguous | error`.

Downstream layers must distinguish "path appears clear" from "we do not
currently know". Absence of a reported obstacle is never treated as a guarantee
of safety.

## 8. Performance & concurrency model

Three rates, strictly ordered:

```
camera FPS  >  local processing frequency  >  AI analysis frequency
```

- Not every frame goes to the AI. AI requests are **throttled/debounced** and
  **cancellable**.
- **No stale overwrites:** each analysis carries a monotonic sequence/generation
  token; a response is discarded if a newer one has already been applied. This
  prevents an old AI response from clobbering a newer frame's analysis.
- Local processing (cheap, frequent) can run between AI calls; AI augments, it
  does not gate every frame.

## 9. Failure, degradation & lifecycle handling

The system must explicitly represent and handle:

- Browser API incompatibility / unsupported features.
- Camera, GPS (Geolocation), and microphone **permission denial**.
- AI API failure, network loss, timeouts, and **stale** AI results.
- Concurrent/overlapping requests (see §8).
- React component unmounting mid-request; abort in-flight work.
- Navigation **session cancellation**.
- Browser **tab visibility** changes (pause/resume capture and analysis).

Degradation is explicit and announced — never a silent pretense that an obstacle
is absent.

## 10. Accessibility

Audio is the **primary** channel; visual UI is secondary. Requirements:

- Full keyboard operability and strong screen-reader support.
- All controls have accessible names; status changes announced appropriately
  (ARIA live regions), independent of TTS availability.
- Never rely on color alone; large touch targets; a clear, always-available
  emergency **stop** control.
- Respect `prefers-reduced-motion`; allow zoom.

Enforced in part by `eslint-plugin-jsx-a11y` (bundled via `eslint-config-next`).

## 11. Privacy

- Camera frames are **not stored** by default; they are processed transiently.
- **No analytics or telemetry** unless explicitly required and documented.
- Secrets live only on the server.

## 12. Validation strategy

- **Zod** schemas in `core` are the single source of truth for any data crossing
  a trust boundary: model output, browser API results, and network responses.
- Parse at the boundary; pass typed, validated values inward. Parse failures are
  handled states, not exceptions that crash the pipeline.

## 13. Session, configuration & errors (added in Phase 1)

- **Session.** A `NavigationSession` (in `core`) is the top-level, client-held
  unit of a run: id, timestamps, mode (`navigate` | `explore`), optional
  destination, latest location/heading/route, and the current `PerceptionStatus`
  and `SafetyAssessment`. A fresh session is honest about uncertainty —
  perception starts `unavailable` and safety starts `unknown` + degraded. There
  is **no database**: sessions live in memory and are persisted to
  `sessionStorage`, validated with Zod on read (`src/app/_session`). The pure
  factory/transitions live in `core`; the client store uses
  `useSyncExternalStore`.
- **Configuration.** `src/config` holds Zod-validated environment config. Server
  secrets (`server-env.ts`) are guarded against browser import and never
  prefixed `NEXT_PUBLIC_`; only non-secret `NEXT_PUBLIC_*` values live in
  `public-env.ts`.
- **Error taxonomy.** `core/errors.ts` defines typed `AppError`s with stable
  codes (permission denied, unavailable, timeout, network, AI error, invalid
  model response, unsupported feature), plus a Zod-validated serialised form so
  failures can cross the client/server boundary and be reconstructed.

## 14. Roadmap (phases)

Phase boundaries are gates: **each phase ends with a summary and stops** — the
next phase is not started automatically.

0. **Foundation (done):** tooling, config, docs, architecture skeleton.
1. **Core domain model + Zod schemas (done):** domain types, session, typed env
   config, error taxonomy, and a minimal accessible UI shell with tests. The
   `VisionProvider` interface (contract only) was pulled forward into this phase.
2. **Navigation Mode UI (done, mocked):** audio-first `/navigate` screen —
   `src/app/_navigation` (see §15). No camera, GPS, AI, routing, or speech.
3. **Browser camera subsystem (done):** `src/camera` — controller, frame
   capture, scheduler, mock consumer (see §16). No AI/GPS/routing.
4. **Server-side Gemini vision pipeline (done):** evolved Scene Representation,
   the real Gemini `VisionProvider` (`@google/genai`, structured output) + dev
   fixtures, `POST /api/vision/analyze` with full validation and typed errors,
   and a client perception harness (single in-flight, no stale overwrites) wired
   to the camera at the `FrameConsumer` seam (see §17). Phase 5's "real Gemini"
   work was folded in here; mounting the pipeline in the live UI is deferred to
   the Safety Engine phase.
5. **Speech Engine (done):** `src/speech` — priority queue with interruption
   rules, duplicate suppression with per-priority cooldowns, browser
   `SpeechSynthesis` behind a swappable `TtsProvider` interface, voice-settings
   persistence, React hook, and a dev-only speech test panel in the navigation
   UI (see §18). ~~Real Gemini provider~~ was folded into Phase 4.
6. **Navigation Engine (done):** `src/navigation` — `LocationController` +
   `useLocation()` wrapping browser Geolocation with explicit state machine
   (unsupported/permission_required/permission_denied/acquiring/active/error/stale),
   heading resolution (GPS course vs. device orientation), haversine geo-math,
   `RoutingProvider` abstraction + `FixtureRoutingProvider` (NYC fixtures),
   turn-by-turn `RouteTracker` (step progression, off-route detection with
   configurable debounce, arrival detection), and a `Route`/`RouteStep`/
   `Destination` model in `core` (see §19).
7. **Deterministic Safety Engine (done):** `src/safety` — five safety levels
   (unknown/safe/caution/danger/critical), seven actions, deterministic
   obstacle/hazard/path evaluation rules, navigation fusion (suppresses route
   instructions when a hazard conflicts with the turn direction), assessment
   expiry, uncertainty penalties, conflicting-obstacle detection, configurable
   staleness thresholds, and the evolved `core` safety schema with `action`,
   `confidence`, and `expiresAt` (see §20).
8. **Decision Engine / real-time pipeline (done):** `src/decision` —
   `NavigationSessionController` orchestrates the full pipeline: camera →
   frame capture → AI analysis → safety → speech. `SpeechDispatch` maps
   safety assessments and route state changes to speech calls with cooldowns
   and duplicate suppression. Perception freshness tracking (fresh/aging/
   stale/none). Navigation Mode UI wired to real controller state with an
   enhanced debug overlay (see §21).
9. Full accessibility pass.
10. Hardening: failure/lifecycle edge cases end-to-end.

Later/future: local CV, vest-mounted camera, depth/sensor fusion.

## 15. Navigation Mode UI (added in Phase 2)

Audio is primary; this screen serves status, caregivers/developers, setup,
fallback interaction, and debugging. Code: `src/app/_navigation`.

- **Model (pure, tested):** `status.ts` (SAFE / CAUTION / DANGER / CRITICAL /
  UNKNOWN; `categoryFromSafety` maps core levels and never reports SAFE for a
  degraded assessment), `announcement.ts` (CRITICAL / HIGH / NAVIGATION /
  NORMAL), `mock-scenarios.ts`, `view-model.ts`.
- **Not colour alone:** each category has text, a glyph, and a distinct border
  style; UNKNOWN is dashed with "?" and "Path not confirmed".
- **ARIA live:** only the instruction text is live. CRITICAL/HIGH use the
  assertive region; NAVIGATION/NORMAL the polite one. Status badges, system
  status, and the debug overlay are not live, so tiny changes are not announced.
- **Mocked state:** default scenario reflects the real session (perception
  unavailable → UNKNOWN). Pausing degrades to UNKNOWN. A "Simulated data" badge
  is always shown.
- **Debug overlay:** development only (`NODE_ENV !== "production"`, inlined so it
  is dead-code-eliminated from production). Shows session id, mode,
  perception/GPS/AI status, safety level, last analysis time, latency, and a
  simulated-scenario switcher. It reads no env/secrets.
- **Responsive:** camera keeps 16:9 (landscape) / 4:3 (portrait) via
  `aspect-ratio`, capped by viewport height; short landscape screens place the
  camera beside the panel; controls are sticky at the bottom.

## 16. Browser camera subsystem (added in Phase 3)

Client-only input layer in [`src/camera`](../src/camera/README.md). It depends
on nothing but the browser (and Zod); `app` consumes it, and later `perception`
will consume `FrameConsumer`.

- **`CameraController`** — framework-agnostic owner of one stream. Explicit
  states `idle | requesting_permission | active | paused | error | unsupported`
  from a pure, tested transition table (`state.ts`). Releases all tracks on
  stop, failure, switch, device loss, and when a late `getUserMedia` result
  arrives after `stop()` (token invalidation). Pause reasons (user PAUSE, tab
  hidden) are tracked separately so one cannot undo the other.
- **`FrameCapture`** — on-demand `captureFrame({ maxWidth, maxHeight, quality })`
  → `Blob` (JPEG by default; no base64). Never runs by itself.
- **`FrameScheduler`** — fixed-delay loop (start/stop/pause/resume), never
  overlaps jobs, aborts and discards in-flight work on pause/stop/hidden tab,
  stops itself after repeated failures, supports an external `AbortSignal`.
- **`FrameConsumer`** — sink interface. Only the dev logging consumer exists
  (metadata only, no pixels, disabled in production builds). The frame loop is
  enabled in development only until a real consumer exists.
- **Hooks** — `useCamera()` (store binding + unmount cleanup) and
  `useFrameLoop()`. Defaults live in `config.ts` (1000 ms, 1024 px box, 0.7).
- **UI** — `CameraViewport` (`_navigation`) renders the preview and every
  non-active state with a persistent polite live region. Camera health appears
  in System status; an active camera does **not** change safety (still UNKNOWN
  until perception exists).
- **Privacy** — frames live only in memory for one consumer call; nothing is
  written to web storage/IndexedDB or sent over the network (E2E asserts this).


## 17. Perception pipeline (added in Phase 4)

Wires camera frames to AI vision and back to a validated Scene Representation.
Flow: `camera frame → POST /api/vision/analyze → provider (Gemini|fixture) →
Zod-validated SceneAnalysis`. Code: [`src/providers`](../src/providers),
[`src/perception`](../src/perception/README.md), and the route under
[`src/app/api/vision/analyze`](../src/app/api/vision). Config:
[`docs/gemini.md`](gemini.md).

- **Scene Representation (evolved).** `core` now carries the conservative
  Phase-4 schema: categorical enums everywhere, a `Hazard` type, explicit
  `uncertainty`, and **no meters field** (no depth sensor → relative-distance
  categories only). `SceneObservation` is the model-output subset;
  `SceneAnalysis` adds server identity/freshness (`analysisId`, `capturedAt`,
  `analyzedAt`, derived `availability`, `provider`).
- **Providers.** `GeminiVisionProvider` (server-only; `@google/genai`,
  structured output, Zod re-validation, typed error mapping) and a dev-only
  `FixtureVisionProvider` (clear / puddle / obstacle / stairs / blocked /
  uncertain) behind the one `VisionProvider` interface. `recommendedImmediateAction`
  is a model *hint*, never a command — the Safety Engine will decide.
- **Route.** `POST /api/vision/analyze` validates request → MIME → size → calls
  the provider → returns a typed `SceneAnalysis` or a typed error. Keys are
  server-only; the browser never calls Gemini directly. On any failure the
  response is `perceptionStatus: "unavailable"` — never a silent "path clear".
- **Client harness.** `PerceptionController` runs **one analysis at a time**,
  coalescing newer frames into a single pending slot, tagging each with a
  monotonic sequence, and applying results through a pure reducer that **drops
  any result older than the one already applied**. `dispose()` aborts in-flight
  work (unmount / session cancellation). A `FrameConsumer` bridge encodes each
  frame transiently (never stored) and submits it.
- **Not yet in the live UI.** The pipeline is wired and unit-tested at the
  `FrameConsumer` seam but is not mounted into `/navigate` yet: that couples
  perception to the still-mocked navigation/safety and changes a run's privacy
  posture (frames leaving the device), which belongs with the Safety Engine.

## 18. Speech engine (added in Phase 5)

Audio is primary; the speech engine is event-driven and speaks only when a new
instruction arrives. Code: [`src/speech`](../src/speech/README.md).

- **`TtsProvider` interface.** A narrow abstraction (`speak`, `stop`, `pause`,
  `resume`, `isSpeaking`, `isSupported`, `onEnd`, `onError`) so the underlying
  engine can be replaced — browser `SpeechSynthesis` now, native mobile TTS or
  cloud TTS later. `WebTtsProvider` is the first implementation.
- **Speech priority.** Five levels in `core/speech.ts`: `critical` (0) > `high`
  (1) > `navigation` (2) > `information` (3) > `low` (4). Interruption rules:
  critical can interrupt anything; high can interrupt navigation/information/low;
  navigation can interrupt low; information and low cannot interrupt.
- **`SpeechQueue`.** Priority-ordered queue. Higher-priority entries sort ahead
  of lower ones; same-priority is FIFO. `enqueue` returns `{ shouldInterrupt }`
  so the engine knows when to cancel the current utterance.
- **`DuplicateSuppression`.** Per-text cooldowns keyed by priority. If the same
  text is submitted again within the cooldown window (3 s for critical up to
  15 s for low), it is silently dropped. `prune()` cleans expired entries.
- **`SpeechEngine`.** Orchestrator composing queue + suppression + provider.
  `speak(text, priority)` checks suppression → enqueues → interrupts or advances;
  `stop()` / `pause()` / `resume()` / `dispose()` manage lifecycle; an
  `onStateChange` callback fires on every transition for React integration.
- **Voice settings.** `VoiceSettings` (rate, pitch, volume, enabled) loaded from
  and saved to `localStorage` via `preferences.ts`. Clamped to safe ranges.
- **React hook.** `useSpeech()` creates a `SpeechEngine` on mount, disposes on
  unmount, syncs settings, and exposes `speak`, `stop`, `pause`, `resume`,
  `isSpeaking`, `isPaused`, `isSupported`, `settings`, `updateSettings`.
- **UI integration.** The VOICE toggle in `SessionControls` now toggles
  `speech.settings.enabled` and stops speech when disabled. A dev-only
  **Speech test** panel (`SpeechTestPanel`) in the navigation UI lets developers
  fire the five test phrases at their priorities, control pause/stop, and adjust
  voice settings.
- **Not yet driven by real decisions.** The speech engine is wired and testable
  but is not yet connected to a Decision Engine — it is invoked manually via the
  dev panel or programmatically via `useSpeech().speak()`. The Decision Engine
  phase will produce `SpeechInstruction`s that the engine consumes.

## 19. Navigation engine (added in Phase 6)

Location tracking, heading resolution, routing abstraction, and turn-by-turn
route state. Code: [`src/navigation`](../src/navigation/README.md).

- **Location state machine.** Seven states: `unsupported`, `permission_required`,
  `permission_denied`, `acquiring`, `active`, `error`, `stale`. Pure transition
  table in `state.ts`; `LocationController` wraps the browser Geolocation API
  (`watchPosition`/`clearWatch`) and drives the machine. A stale timer fires
  after 15 s without a position update. Subscribable via
  `subscribe`/`getSnapshot` (compatible with `useSyncExternalStore`).
- **Heading resolution.** GPS course heading and device orientation heading are
  separate inputs. `resolveHeading()` picks the freshest source and tags it with
  `HeadingSource` (`gps` | `device_orientation` | `unknown`).
- **Geo-math.** `haversineDistance`, `bearingBetween`, and `distanceToSegment` in
  a small pure module, used by both the route tracker and off-route detection.
- **`RoutingProvider` abstraction.** `geocode(query)` → `GeocodingResult[]` and
  `getWalkingRoute(origin, destination)` → `Route`. The interface is provider-
  agnostic; `FixtureRoutingProvider` is the first implementation (three NYC
  fixture destinations, interpolated walking routes). A live routing backend
  (e.g. Google Directions) can be added behind the same interface later.
- **`RouteTracker`.** Tracks navigation state against a `Route`: current step,
  step progression (advances when within `stepAdvanceMeters` of a step's end
  coordinate), off-route detection with configurable threshold and debounce
  (transitions to `off_route` only after `offRouteDebounceMs` of continuous
  deviation beyond `offRouteThresholdMeters`), arrival detection (within
  `arrivalThresholdMeters` of the destination), and fractional progress.
- **React hook.** `useLocation()` creates a `LocationController` on mount,
  cleans up on unmount, and exposes the latest `LocationSnapshot` via
  `useSyncExternalStore`.
- **Not yet in the UI.** The navigation engine is wired and unit-tested but is
  not mounted into `/navigate` yet — the UI integration belongs with the Safety
  Engine or Decision Engine phase, which needs location and route context to
  produce meaningful decisions.

## 20. Deterministic safety engine (added in Phase 7)

Pure, deterministic assessment of scene + navigation context. No AI model, no
network, no side effects — same input always produces the same output. Code:
[`src/safety`](../src/safety/README.md). Rules reference:
[`docs/safety-engine.md`](safety-engine.md).

- **Five safety levels.** `unknown` (default/degraded) < `safe` < `caution` <
  `danger` < `critical`. The previous `core` level set (`clear`/`caution`/`stop`/
  `unknown`) was replaced; `clear` became `safe`, `stop` became `critical`, and
  `danger` was added between `caution` and `critical`. The UI's `StatusCategory`
  now maps 1:1 with the core levels (except `safe` + `degraded` → `UNKNOWN`).
- **Seven safety actions.** `none`, `continue`, `continue_cautiously`,
  `slow_down`, `move_left`, `move_right`, `stop`. These are deterministic
  outputs, not model hints. `SafetyAssessment` now carries `action`,
  `confidence` (0–1), and `expiresAt`.
- **Obstacle rules.** Each `Obstacle` is scored by position × distance ×
  severity. Center + very_near + high/critical → CRITICAL/STOP; center + near +
  high → DANGER/STOP; lateral + near + high → CAUTION/MOVE_LEFT or MOVE_RIGHT.
  Unknown distance is conservatively treated as `near`; unknown severity as
  `medium`. Approaching obstacles boost the threat level.
- **Hazard rules.** Center + high/critical → CRITICAL/STOP; lateral + high →
  DANGER + lateral move.
- **Path status.** `blocked` → CRITICAL/STOP; `partially_blocked` →
  CAUTION/SLOW_DOWN; `unknown` → CAUTION/CONTINUE_CAUTIOUSLY.
- **Worst-signal aggregation.** Multiple obstacles/hazards: the worst threat
  wins. If near obstacles exist on both left and right (conflicting), the engine
  returns DANGER/STOP (cannot safely move in either direction).
- **Uncertainty penalty.** When overall confidence < 0.3 or uncertainty is
  `high`, a `safe` result is promoted to `caution` and confidence is capped.
  Ambiguous availability also promotes `safe` → `caution`.
- **Assessment expiry.** Every assessment has an `expiresAt` (configurable, default
  3 s). After expiry it must be treated as `unknown`.
- **Navigation fusion.** If the current route step is a turn (left/right) and
  perception shows the turn direction is blocked (near + high severity), the
  engine produces a `FusionOverride` that suppresses the route instruction and
  replaces it with a safety message ("Right side appears blocked. Continue
  carefully."). The engine never invents an alternative route — it can only
  say stop, slow down, continue cautiously, or move laterally.
- **Stale data handling.** Perception older than 10 s → `unknown`. Location
  older than 15 s → assessment marked `degraded` with a reason (does not change
  the level). Thresholds are configurable via `SafetyConfig`.
- **Now in the UI.** The safety engine is consumed by the Decision Engine's
  `NavigationSessionController`, which runs assessments on every new perception
  result and on expiry, and dispatches results to the Speech Engine via
  `SpeechDispatch` (see §21). 73 table-driven test cases.

## 21. Decision engine / real-time pipeline (added in Phase 8)

The `NavigationSessionController` in `src/decision` is the session-level
orchestrator that wires every subsystem into a real-time loop. React observes
state via `useSyncExternalStore`; it never creates or disposes subsystems
directly. Code: [`src/decision`](../src/decision/README.md).

- **Pipeline.** Camera capture → blob encoding → `PerceptionController`
  (one-at-a-time AI analysis, latest-frame-wins) → `SafetyEngine` assessment →
  `SpeechDispatch` → `SpeechEngine` output. Location updates flow through
  `RouteTracker` and also feed safety context.
- **`NavigationSessionController`.** Creates and owns: `CameraController`,
  `FrameCapture`, `FrameScheduler`, `PerceptionController`, `LocationController`,
  `RouteTracker`, `SafetyEngine`, `SpeechEngine`, `SpeechDispatch`. Exposes a
  `SessionControllerSnapshot` via `subscribe`/`getSnapshot`. Lifecycle:
  `idle → starting → running ⇄ paused → stopping → stopped`. `dispose()` tears
  down everything. `start()` can be called again after `stop()`.
- **`SpeechDispatch`.** Maps safety assessments and route state changes to
  speech calls. Critical/danger bypass cooldown and speak immediately. Lower
  levels respect a configurable cooldown and only speak on level changes.
  Navigation speech fires on step changes with its own cooldown. Arrival and
  off-route are announced once. Perception freshness transitions (→ stale,
  → none) trigger informational speech.
- **Perception freshness.** Four states: `fresh` (< 3 s), `aging` (3–7 s),
  `stale` (7–10 s), `none` (no analysis). Thresholds are configurable.
- **Safety re-evaluation.** Runs on every new perception result and on a
  periodic interval matching the assessment TTL (3 s default), so expired
  assessments degrade to `unknown` promptly.
- **Stats.** FPS (rolling 1 s window), AI request count, last analysis
  timestamp, AI latency, last speech timestamp.
- **Debug overlay.** Enhanced with FPS, AI request count, perception freshness,
  GPS accuracy, and speech queue status. The mock scenario selector remains
  available for testing.
- **Error recovery.** Camera failure puts the camera subsystem into error
  state; the session continues in degraded mode. The safety engine treats
  missing perception as `unknown`. Speech dispatch announces perception
  unavailability.
- **UI wiring.** `ActiveNavigation` in `navigation-screen.tsx` creates a
  single `NavigationSessionController` and observes its snapshot. A
  `buildRealViewModel` function maps the snapshot to the existing
  `NavigationViewModel` shape. Mock scenarios remain available via the
  debug overlay's scenario selector.

## 22. Voice input, scene queries, and Explore Mode (added in Phase 9)

Phase 9 adds two user-facing product modes and the supporting voice/query
infrastructure. Code: [`src/voice`](../src/voice/), [`src/app/_explore`](../src/app/_explore/).

### Voice input (`src/voice`)
- **`VoiceInput`** wraps the browser `SpeechRecognition` API (with
  `webkitSpeechRecognition` vendor prefix). Supports `startListening` (push-to-
  talk, *not* always-listening), `stopListening`, and `submitText` (text
  fallback). Exposes `subscribe`/`getSnapshot` for `useSyncExternalStore`.
- States: `idle → listening → processing`, plus `unsupported`, `denied`,
  `error`.

### Scene query pipeline
- **Server endpoint** `POST /api/vision/query`: accepts `{ frame, question }`,
  calls `VisionProvider.queryScene`, returns concise free-form text.
- **`VisionProvider.queryScene`**: optional method on the provider interface.
  Gemini implementation uses a separate system instruction that produces one or
  two short sentences. Fixture provider returns a canned response.
- **`SceneQueryHandler`** (`src/decision`): coordinates frame capture → API call
  → speech. States: `idle → capturing → querying → speaking → idle`.
  Integrated into `NavigationSessionController` so it shares the same frame
  capture and speech engine. Exposed via `submitQuery(question)` on the
  controller and `query` in the snapshot.
- **`SceneQueryClient`** (`src/perception`): browser-side fetch wrapper for the
  query endpoint, mirroring `AnalysisClient`.

### Session creator
- Updated `SessionCreator` with recent-destinations support (localStorage,
  max 5, no auth/cloud), destination selection from recents, and distinct
  "Start navigation" / "Start exploring" submit labels.

### Navigation Mode (complete)
- Destination input with recent-destination history.
- Full real-time pipeline: camera + GPS + AI analysis + safety + speech.
- Route tracking, step-by-step instructions, off-route/arrival detection.

### Explore Mode (complete)
- `ExploreScreen` (`src/app/_explore`): camera + safety + push-to-talk +
  text fallback. Uses the same `NavigationSessionController` (no destination or
  route). Displays query status (processing, answer, error) in a live region.
- `QueryInput` component: push-to-talk button + text form.
- No destination required, no route tracking — pure obstacle/environment
  awareness plus user questions.
