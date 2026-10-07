# blind-nav

Browser-based prototype for an **AI-assisted navigation and obstacle-awareness
system for visually impaired users**.

A camera observes the environment and the system provides **spoken guidance** for
navigation and obstacle awareness. This repository is the **software-architecture
prototype** that will later move to mobile / wearable (vest-mounted camera)
hardware. We are building the browser prototype first to establish the complete
software architecture.

> ⚠️ **Safety notice.** This is an **assistive prototype**, not a certified
> safety-critical, medical, or mobility device. It **does not guarantee**
> obstacle or collision avoidance and must never be relied upon for safety.
> Always use your established mobility aids and techniques. If perception is
> unavailable, stale, or uncertain, the system says so rather than pretending
> the path is clear.

## Status

**Phase 3 — Browser camera subsystem.** `/navigate` now opens the real camera
(`getUserMedia`, environment-facing when available) through a reusable
`CameraController` (`src/camera`): explicit states (idle / requesting_permission
/ active / paused / error / unsupported), permission-denied and unavailable
handling, camera switching, pause on tab-hidden, and guaranteed track release on
stop/unmount. A controlled `FrameCapture` (JPEG `Blob`, ~1 fps default, ≤1024 px)
and a `FrameScheduler` feed a **mock consumer that logs metadata only, in
development**. Frames are never persisted or uploaded; there is still no Gemini,
GPS, routing, or speech, so the safety status stays honestly UNKNOWN. See
[`src/camera/README.md`](src/camera/README.md) for design and browser
limitations.

**Phase 2 — Navigation Mode UI (mocked).** `/navigate` is an an audio-first,
high-contrast screen: camera placeholder, safety category (SAFE / CAUTION /
DANGER / CRITICAL / UNKNOWN — text + glyph + border style, never colour alone),
a speech-priority-aware instruction with careful ARIA live regions, destination
and system status, VOICE / PAUSE / STOP controls, and a development-only debug
overlay (with a simulated-scenario switcher). All state is **mocked**; there is
no camera, GPS, Gemini, routing, or speech.

**Phase 1 — Core domain model.** The `core` domain types + Zod schemas (Scene
Representation, session, safety, navigation, decision, speech), the typed error
taxonomy, the `VisionProvider` interface (contract only), typed env config, and
a minimal accessible UI shell (home + session creation, `/navigate` and
`/explore` placeholders) are in place, with unit (Vitest) and e2e (Playwright)
tests. **No live features yet** (no camera, AI, GPS, routing, or speech). See
[`docs/architecture.md`](docs/architecture.md) for the design and the planned
phases.

## Tech stack

- **Next.js 16** (App Router) + **React 19** — client/server separation, with
  secrets and AI calls confined to the server.
- **TypeScript 5.9** in strict mode (pinned below the TS 7 native port for
  tooling compatibility — see [ADR 0008](docs/decisions.md)).
- **Zod 4** — all external/model data is validated; arbitrary model JSON is
  never trusted.
- **ESLint 10** (flat config, incl. `jsx-a11y`) + **Prettier**.
- **Vitest** + Testing Library (jsdom) for unit tests; **Playwright** for e2e.
- AI vision via the official **`@google/genai`** SDK (added in a later phase),
  behind a replaceable provider abstraction.

## Requirements

- [Bun](https://bun.sh/) `>= 1.3` (package manager + script runner)
- Node.js `>= 20.9` (see [`.nvmrc`](.nvmrc); Next.js targets the Node runtime)

## Getting started

```bash
bun install
cp .env.example .env.local   # fill in values in later phases; never commit secrets
bun run dev                  # http://localhost:3000
```

## Scripts

| Script                | Purpose                                           |
| --------------------- | ------------------------------------------------- |
| `bun run dev`         | Start the dev server                              |
| `bun run build`       | Production build                                  |
| `bun run start`       | Serve the production build                        |
| `bun run lint`        | ESLint (`lint:fix` to autofix)                    |
| `bun run format`      | Prettier write (`format:check` to verify)         |
| `bun run typecheck`   | `tsc --noEmit`                                    |
| `bun run test`        | Run unit tests (`test:watch`, `test:coverage`)    |
| `bun run test:e2e`    | Playwright e2e (run `bunx playwright install` first) |
| `bun run check`       | format:check + lint + typecheck + test (one shot) |

## Project layout

```
src/
  app/          Next.js App Router (UI + server route handlers under app/api)
    _components/   Shell UI components (session creator, details, stop)
    _session/      Client-held session: store + sessionStorage persistence
    navigate/      Navigate-mode placeholder route
    explore/       Explore-mode placeholder route
  core/         Shared domain types + Zod schemas + errors (single source of truth)
  config/       Typed, Zod-validated env (server-only + client-safe public)
  perception/   Sensor input → validated Scene Representation
  providers/    Replaceable AI vision provider abstraction (server-only)
  safety/       Deterministic safety engine (independent of the LLM)
  navigation/   Route / GPS / position / heading reasoning
  decision/     Reconciles safety + navigation + scene into decisions
  speech/        Audio output (primary user channel)
e2e/            Playwright end-to-end specs
docs/
  architecture.md   System design, data flow, constraints
  decisions.md      Architecture Decision Records (ADRs)
```

Each `src/*` layer has a `README.md` describing its responsibilities and rules.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — architecture & data flow
- [`docs/decisions.md`](docs/decisions.md) — decision records
- [`CLAUDE.md`](CLAUDE.md) — working guide for contributors and AI assistants

## Privacy

Camera frames are not stored by default. No analytics or telemetry. API keys are
server-side only and never exposed to the browser.