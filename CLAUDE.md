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

**Phase 3 — Browser camera subsystem complete**, on top of Phase 2 (mocked
Navigation Mode UI) and Phase 1 (core domain model, `VisionProvider` interface,
typed env). `src/camera` provides `CameraController` (explicit states, cleanup,
switching, visibility pause), `FrameCapture` (JPEG `Blob`), `FrameScheduler`,
a dev-only metadata-logging `FrameConsumer`, and `useCamera`/`useFrameLoop`.
`/navigate` starts the camera on entry and releases it on stop/unmount;
`CameraViewport` renders every camera state. Frames are never persisted or
uploaded; there is still no Gemini, GPS, routing, or speech, so safety stays
honestly UNKNOWN. Vitest + Playwright (mocked camera) cover it. Browser
limitations: [`src/camera/README.md`](src/camera/README.md).

Next up is **Phase 4** (mock `VisionProvider` + server route handler +
validation/concurrency harness, then pipeline wiring; see the roadmap in
[`docs/architecture.md`](docs/architecture.md)). Do not start it without being
asked.
