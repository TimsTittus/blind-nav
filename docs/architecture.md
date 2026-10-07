# Architecture

Status: **Phase 2 (Navigation Mode UI, mocked)**. Phase 1 added the core domain model. This document describes the target
software architecture the prototype is being built toward. The `core` domain
model + Zod schemas now exist, along with the `VisionProvider` interface
(contract only), typed env config, the typed error taxonomy, and a minimal
accessible UI shell with a client-held session. The remaining feature layers
(`perception`, `safety`, `navigation`, `decision`, `speech` logic) still exist
as documented seams and gain real logic in later phases.

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
| [`safety`](../src/safety)      | Deterministic safety assessment from the scene                    | core                |
| [`navigation`](../src/navigation)| Route/GPS/position/heading reasoning                             | core                |
| [`decision`](../src/decision)  | Reconcile safety + navigation + scene → decision & cadence        | core, safety, navigation |
| [`speech`](../src/speech)      | Speak decisions; prioritize safety; ARIA announcements            | core                |
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
- First implementation: **Google Gemini** via the official `@google/genai` SDK,
  using **structured JSON output**, parsed with Zod.
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
3. A mock `VisionProvider` implementation + server route handler + the
   validation/concurrency harness (no real camera yet).
4. Client camera capture + the multi-rate pipeline wired to the mock provider.
5. Real Gemini provider (`@google/genai`, structured output).
6. Deterministic Safety Engine.
7. Navigation Engine (destination, route, position, heading).
8. Decision Engine (reconciliation + cadence).
9. Speech Engine + full accessibility pass.
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
