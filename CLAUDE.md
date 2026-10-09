# CLAUDE.md

Working guide for contributors and AI assistants in this repository. Read this
and [`docs/architecture.md`](docs/architecture.md) before making changes.

## What this is

A **browser prototype** (Next.js) for an AI-assisted navigation and
obstacle-awareness system for visually impaired users. We are establishing the
software architecture before any move to mobile/wearable hardware. It is an
**assistive prototype, not a certified safety device**, and must never claim to
guarantee collision avoidance.

## Commands

```bash
bun install            # install deps (Bun >= 1.3; Next.js targets Node >= 20.9)
bun run dev            # dev server at http://localhost:3000
bun run build          # production build
bun run lint           # ESLint   (bun run lint:fix to autofix)
bun run format         # Prettier (bun run format:check to verify)
bun run typecheck      # tsc --noEmit
bun run test           # Vitest   (test:watch, test:coverage)
bun run check          # format:check + lint + typecheck + test
```

## Workflow (required)

**Before changing code:** inspect the repo, understand existing structure and
configuration, identify constraints, propose the implementation, and only then
implement.

**After implementing:** run, in order — `format` → `lint` → `typecheck` →
`test` → `build`. Fix all errors. Manually verify behavior where possible.
`bun run check` covers the first four quickly.

**At the end of every phase:** summarize files changed, architecture changes,
tests executed, known limitations, and the next recommended phase — then
**stop**. Do not start the next phase automatically.

Keep [`CLAUDE.md`](CLAUDE.md), [`README.md`](README.md),
[`docs/architecture.md`](docs/architecture.md), and
[`docs/decisions.md`](docs/decisions.md) up to date as the architecture evolves.
Add an ADR for any significant decision.

## Architecture rules (do not violate)

- **The LLM is not the safety mechanism.** Perception only *describes* the world
  as validated structured data; the deterministic **Safety Engine** decides
  risk. The LLM never controls navigation or triggers arbitrary app actions.
- **Layer separation:** `core` ←
  `providers`/`perception`/`fast-perception`/`fusion`/`safety`/`navigation`
  → `decision` → `speech` → `app`. Dependencies point toward `core`; lower
  layers never import UI. One concern per layer. See each `src/*/README.md`.
- **Vision vs. GPS/route are separate inputs,** reconciled only in the Decision
  Engine. Safety outranks navigation convenience.
- **Local vision vs. cloud vision** are reconciled only in `src/fusion`, and
  never by preferring a source. Local evidence can only **add** risk, and what
  it is allowed to claim is governed by `FastTrustPolicy`.
- **AI provider is replaceable** behind the `VisionProvider` interface in
  `src/providers`. Gemini is just the first implementation; `LocalVisionProvider`
  and `HybridVisionProvider` were added in Phase 14. The local inference runtime
  is separately replaceable behind `LocalVisionBackend`.
- **Validate everything external with Zod.** Never trust arbitrary model JSON,
  browser-API output, or network responses. Parse at the boundary.
- **Represent uncertainty explicitly.** Stale/unavailable/ambiguous perception
  is a first-class state. Never silently imply the path is clear.

## Client/server & secrets

- AI calls and API keys are **server-only** (route handlers in `src/app/api/**`).
- **Never** expose keys to the browser or use `NEXT_PUBLIC_` for secrets.
- The browser sends frames/context to an internal endpoint; the server calls the
  provider and returns validated JSON.

## Performance & lifecycle

- `camera FPS > local processing frequency > AI analysis frequency`. Don't send
  every frame to the AI.
- AI calls are throttled/debounced, cancellable, and carry a sequence token so a
  **stale response never overwrites a newer one**.
- Handle: unsupported browser APIs; camera/GPS/mic permission denial; AI/network
  failure; stale results; concurrent requests; component unmount; session
  cancellation; tab-visibility changes.

## Accessibility (non-negotiable)

Audio is the primary channel; visual UI is secondary. Keyboard operable; strong
screen-reader support; accessible names on all controls; announce status changes
via ARIA live regions; never rely on color alone; large touch targets; a clear,
always-available emergency **stop**. `eslint-plugin-jsx-a11y` runs in lint.

## Privacy

No camera-frame storage by default. No analytics/telemetry unless explicitly
required and documented. Secrets stay on the server.

## Engineering conventions

- TypeScript **strict**; avoid `any` (`no-explicit-any` is an error).
- Small modules; no giant components; no unnecessary abstraction; no duplicated
  business logic; no premature microservices.
- Handle loading/error/permission states everywhere.
- Prefer current official SDKs/APIs (e.g. official `@google/genai` for Gemini
  with structured output); consult current docs rather than copying deprecated
  examples.
- TypeScript is pinned to the 5.9 line — see [ADR 0008](docs/decisions.md) before
  upgrading.

## Current status

**Phase 14 — local perception integrated behind a trust policy and fusion.**
On top of Phase 13 (local CV research spike), Phase 12 (PWA, capability
detection, mobile UI), Phase 11 (evaluation framework), Phase 10 (performance),
Phase 9 (Navigation + Explore modes), Phase 8 (decision engine), Phase 7 (safety
engine), Phase 6 (navigation engine), Phase 5 (speech), Phase 4 (server-side
Gemini vision), Phase 3 (camera), Phase 2 (mocked UI), Phase 1 (core model).

Phase 14 adds two new layers and keeps Gemini in charge of semantics:

- **`src/fast-perception/`** — on-device segmentation (SeaFormer-S via
  `onnxruntime-web`, WebGPU → WASM) behind a `LocalVisionBackend` seam. Produces
  the normalized `FastPerceptionFrame` contract in `core/fast-perception.ts`;
  tensors and ADE20K class names never leave the layer. A self-pacing loop
  (150 ms target) keeps inference under half of wall-clock time.
- **`src/fusion/`** — merges cloud and local vision. Local evidence may only
  **add** risk; absence of evidence is `unknown`, never `clear`; conflicts are
  kept, not resolved away. Neither source is preferred by identity.
- **`FastTrustPolicy`** — local answers are admitted per the reliability Phase 13
  measured. Default: `stairs`/`somethingAhead`/`largeObstacle` may raise risk to
  `caution`; `blocked` (precision 0.13) **may not force a stop**;
  `sidewalk`/`traversable` can never reduce risk.
- `LocalVisionProvider` + `HybridVisionProvider`; `PerceptionFusionInput` on the
  Safety Engine (conflicted or local-only perception is never `safe`);
  local metrics in `PerformanceMonitor`; an `localPerception` capability;
  COOP/COEP headers.

**No model weights are committed** (`public/models/` is gitignored; install
locally with `bun run models:install`), because the ADE20K/SeaFormer licence
review from ADR 0026 is unresolved. A clean checkout therefore builds without
weights and the app runs cloud-only and says so; `models:install` is a
development convenience, not a deployment step.

Docs: [`docs/fast-perception.md`](docs/fast-perception.md), ADR 0027.

**Still unverified, and the reason this is not production-ready:** no phone has
ever run this, there are no real-GPU WebGPU numbers, and CPU/GPU/memory/battery
are unmeasured. `blocked` and `large obstacle` still have no acceptable
operating point. See `docs/fast-perception.md` §9.

Next recommended: **real-device verification** (Android + iOS: Phase-12
PWA/camera/speech, Phase-13 browser benchmark with a real GPU, and Phase-14
local inference latency, duty cycle and battery), then hardening of
failure/lifecycle edge cases. Do not start without being asked.

DO NOT:

- put Gemini API keys in client code
- send every video frame to Gemini
- treat Gemini as a guaranteed collision detector
- use arbitrary model-generated text as application state
- trust model JSON without validation
- convert relative AI distance into fake meter values
- let stale AI results overwrite newer results
- allow unlimited concurrent AI requests
- store camera frames by default
- store precise location unnecessarily
- add a database before it is required
- add authentication before it is required
- add microservices
- introduce tRPC unless there is an actual architectural need
- introduce Redis unless there is an actual architectural need
- introduce Docker just for the sake of using Docker
- create giant React components
- put business logic in JSX
- silently treat unavailable perception as "clear"
- silently swallow errors
- claim the system guarantees safety
- implement hardware before the software prototype works
- introduce SeaFormer merely because it was mentioned
- use deprecated Gemini APIs without checking current official documentation
- commit or deploy model weights (`public/models/` is gitignored; the ADE20K
  licence review is unresolved)
- let local CV assert `blocked`, set `recommendedImmediateAction`, report
  terrain, or reduce risk in any way
- claim any frame rate is safe — none has been validated on a device
- let model-specific shapes (tensors, class indices, ADE20K labels) leave
  `src/fast-perception`
- resolve a cloud/local conflict by preferring a source instead of representing it