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

**Phase 15 — CameraSource abstraction and hardware roadmap.** A source-agnostic
`CameraSource` interface now sits between camera hardware and the perception
pipeline. `BrowserCameraSource` adapts the existing browser camera; planned
`MobileCameraSource` and `ExternalCameraSource` are declared but not built.
A normalized `CameraFrame` carries no browser-specific objects. Five hardware
options (phone on vest, phone + USB camera, Raspberry Pi, Jetson Orin,
Android wearable) are evaluated in [`docs/hardware-roadmap.md`](docs/hardware-roadmap.md) —
**no hardware is chosen**. Details: ADR 0028.

**Phase 14** integrated on-device vision alongside Gemini. A small
segmentation model (SeaFormer-S via `onnxruntime-web`, WebGPU → WASM) runs
locally several times a second and its findings are merged with Gemini's before
the deterministic Safety Engine sees anything. Details:
[`docs/fast-perception.md`](docs/fast-perception.md).

**No model weights ship with the app**: the ADE20K/SeaFormer licence review is
unresolved, so `public/models/` is gitignored and populated with
`bun run models:install`. Without it the app runs cloud-only and reports that in
the capability panel. **Nothing here has been verified on a phone**, and no
frame rate has been shown to be safe.

**Phase 13** benchmarked local CV candidates (SeaFormer-S, SegFormer-B0,
RF-DETR, D-FINE, Depth Anything V2) in an isolated spike
([`spikes/local-cv/`](spikes/local-cv/README.md)) and recommended SeaFormer-S on
latency and memory: [`docs/local-cv-evaluation.md`](docs/local-cv-evaluation.md).

**Phase 12** made the app an installable PWA with a capability-detection layer
and mobile UI optimizations ([`docs/pwa.md`](docs/pwa.md); not yet verified on
real phones). **Phase 11** added the evaluation framework. **Phase 10** added
performance profiling. **Phase 9** completed Navigation Mode and Explore Mode
(push-to-talk scene questions).

Earlier phases: decision engine / real-time pipeline (Phase 8), deterministic
safety engine (Phase 7), navigation engine (Phase 6), speech engine (Phase 5),
server-side Gemini vision pipeline (Phase 4), browser camera (Phase 3), mocked
Navigation Mode UI (Phase 2), core domain model (Phase 1). See
[`docs/architecture.md`](docs/architecture.md) for the full design and roadmap.

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
| `bun run models:install` | Install local CV weights into `public/models/` (not committed) |
| `bun run models:clean`   | Remove the installed weights                   |
| `bun run check`       | format:check + lint + typecheck + test (one shot) |

## Project layout

```
src/
  app/          Next.js App Router (UI + server route handlers under app/api)
    _components/   Shell UI components (session creator, details, stop)
    _explore/      Explore mode UI (push-to-talk, query input)
    _navigation/   Navigation mode UI (camera, safety, route, debug)
    _session/      Client-held session: store + sessionStorage persistence
    api/vision/    Server endpoints: analyze (structured) + query (free-form)
    navigate/      Navigate-mode route
    explore/       Explore-mode route
  core/         Shared domain types + Zod schemas + errors (single source of truth)
  config/       Typed, Zod-validated env (server-only + client-safe public)
  perception/   Sensor input → validated Scene Representation + query client
  providers/    Replaceable AI vision provider abstraction (cloud = server-only)
  fast-perception/ On-device CV: normalized fast answers + trust policy (client-only)
  fusion/       Merges cloud + local vision; keeps conflicts explicit
  safety/       Deterministic safety engine (independent of the LLM)
  navigation/   Route / GPS / position / heading reasoning
  decision/     Reconciles safety + navigation + scene into decisions + scene queries
  speech/       Audio output (primary user channel)
  voice/        Voice input (browser SpeechRecognition + text fallback)
e2e/            Playwright end-to-end specs
docs/
  architecture.md   System design, data flow, constraints
  decisions.md      Architecture Decision Records (ADRs)
```

Each `src/*` layer has a `README.md` describing its responsibilities and rules.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — architecture & data flow
- [`docs/decisions.md`](docs/decisions.md) — decision records
- [`docs/fast-perception.md`](docs/fast-perception.md) — on-device vision: setup, trust policy, measurements
- [`docs/local-cv-evaluation.md`](docs/local-cv-evaluation.md) — the Phase 13 model evaluation
- [`docs/hardware-roadmap.md`](docs/hardware-roadmap.md) — future hardware options evaluation (no choice made)
- [`CLAUDE.md`](CLAUDE.md) — working guide for contributors and AI assistants

## Privacy

Camera frames are not stored by default. No analytics or telemetry. API keys are
server-side only and never exposed to the browser.