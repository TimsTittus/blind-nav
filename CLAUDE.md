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
- **Layer separation:** `core` ← `providers`/`perception`/`safety`/`navigation`
  → `decision` → `speech` → `app`. Dependencies point toward `core`; lower
  layers never import UI. One concern per layer. See each `src/*/README.md`.
- **Vision vs. GPS/route are separate inputs,** reconciled only in the Decision
  Engine. Safety outranks navigation convenience.
- **AI provider is replaceable** behind the `VisionProvider` interface in
  `src/providers`. Gemini is just the first implementation.
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

**Phase 12 — Installable PWA, capability detection, and mobile UI**, on top of
Phase 11 (evaluation framework), Phase 10 (performance profiling and
optimization), Phase 9 (Navigation Mode + Explore Mode), Phase 8 (decision
engine / real-time pipeline), Phase 7 (safety engine), Phase 6 (navigation
engine), Phase 5 (speech engine), Phase 4 (server-side Gemini vision pipeline),
Phase 3 (browser camera), Phase 2 (mocked Navigation Mode UI), and Phase 1
(core model, typed env). Phase 12 adds: installable PWA (web manifest, service
worker, icons, install prompt), capability detection layer
(`src/capabilities/` — Camera, Location, Speech, Microphone, Orientation with
five states and permission-change re-detection), CapabilityStatus UI on the
home page, mobile UI optimizations (prominent STOP button, touch-action
manipulation, safe-area insets, accidental-touch prevention). `docs/pwa.md`
documents expected browser support, permissions, and known limitations; none of
it has been verified on a real phone yet.

**Phase 13 — Local CV research spike (complete, not integrated).** Code lives in
`spikes/local-cv/` (own `package.json`/`tsconfig`; excluded from the root
tsconfig, ESLint, and Vitest; nothing in `src/` imports it). Findings and
recommendation: `docs/local-cv-evaluation.md` (ADR 0026). Gemini is still the
only provider in the navigation loop; there is no local CV in the app.

Next recommended: **real-device verification** (phones: Phase-12 PWA/camera/
speech behaviour and the Phase-13 browser benchmark incl. real-GPU WebGPU), then
hardening of failure/lifecycle edge cases. Do not start either without being
asked.

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