# `providers/` — replaceable AI vision provider abstraction

The seam that keeps the AI vision model **replaceable**. Perception talks to one
narrow interface; concrete providers implement it.

**Status: Phase 4 — the interface and two implementations exist.**

- `VisionProvider` (`provider.ts`): given a frame (+ minimal context), returns a
  **validated** `SceneAnalysis`, or throws a typed failure.
- `gemini/` — **`GeminiVisionProvider`** (server-only): official `@google/genai`
  SDK (`ai.models.generateContent`) with **structured JSON output** and inline
  base64 image input, re-validated with Zod and normalized. Error mapping and
  the response schema live alongside it. Configuration: [`docs/gemini.md`](../../docs/gemini.md).
- `fixture/` — **`FixtureVisionProvider`** (dev/test): canned scenes (clear /
  puddle / obstacle / stairs / blocked / uncertain) behind the same interface,
  so the pipeline runs with no API key.
- `normalize.ts` — shared: stamps a `SceneObservation` with server identity /
  freshness and derives `availability`, producing a Zod-validated `SceneAnalysis`.
- `local/` — **`LocalVisionProvider`** (Phase 14, **client-only**): on-device
  segmentation via [`fast-perception`](../fast-perception/README.md), mapped
  through the same `SceneObservation` boundary under a trust policy. Unlike every
  provider before it, this one is constructed in the browser, not the route
  handler. The real-time path does not use it — `FastPerceptionController` talks
  to the backend directly, because decoding a base64 data URL per frame would
  cost more than the inference.
- `hybrid/` — **`HybridVisionProvider`** (Phase 14): a cloud provider plus
  `LocalVisionProvider`, reconciled by [`fusion`](../fusion/README.md). Used for
  the cloud-only / local-only / hybrid comparison; the live pipeline runs the two
  loops at their own frequencies instead, so neither blocks the other.
- Later: OpenRouter models, object detection, depth estimation — added without
  touching callers.

**Rules — critical**

- Any **key-bearing provider is server-only**. The Gemini provider holds the API
  key and imports the SDK, so it is reachable only from the route handler via a
  server module and is **not** re-exported from the `@/providers` barrel — no
  client bundle can import it. API keys live in server env vars and must never
  reach client/browser code or `NEXT_PUBLIC_*`. Browser code calls the internal
  route handler (`src/app/api/vision/analyze`); the route handler calls the
  provider. (The pure fixture provider has no key/SDK and is safe anywhere.)
- The application **never trusts arbitrary model-generated JSON**. All output is
  parsed through Zod; parse failures are a handled failure state, not a crash.
- A provider supplies perception input only. It does **not** decide navigation,
  safety, or any application action.
