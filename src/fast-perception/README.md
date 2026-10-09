# `fast-perception/` — local, on-device obstacle awareness

Runs a small semantic-segmentation model **in the browser tab**, several times a
second, to answer six yes/no questions about the walking corridor ahead. It is
the `FastPerception` half of the Phase 14 pipeline; the cloud provider still
does all semantic reasoning.

**Client-only.** Never import this from a route handler.

## Status and honest limits

- Added in **Phase 14** on the recommendation of
  [`docs/local-cv-evaluation.md`](../../docs/local-cv-evaluation.md) (ADR 0026),
  which chose SeaFormer-S on latency and memory — **not** accuracy.
- **No model weights ship with the app.** The ADE20K/SeaFormer licence review is
  unresolved, so the model URL is configuration and absent by default. Install
  one locally with `bun run models:install`; see
  [`docs/fast-perception.md`](../../docs/fast-perception.md).
- **Not validated on a phone.** Every latency figure anywhere in this repo comes
  from a laptop. No frame rate here is known to be safe.
- The local model is **not a collision detector** and cannot see potholes,
  kerbs, wetness, step direction, or traffic.

## What it answers

Something directly ahead? · Walking area blocked? · Sidewalk? · Staircase? ·
Large obstacle? · Path traversable?

Every answer is **tri-state** — `true`, `false`, or `null` for "this model
cannot say". `null` is never read as "no".

## Modules

| File                   | Role                                                                           |
| ---------------------- | ------------------------------------------------------------------------------ |
| `config.ts`            | Frequency targets, duty-cycle budget, confidence cap, default model URL        |
| `grid.ts`              | The fixed 32 × 24 grid and the walking-corridor geometry                        |
| `backend.ts`           | `LocalVisionBackend` — the seam that keeps the inference runtime replaceable    |
| `onnx-backend.ts`      | ONNX Runtime Web: WebGPU where there is a real GPU, WASM otherwise             |
| `create-backend.ts`    | Lazy `createOnnxBackend()`; the dynamic import keeps ORT out of the main bundle |
| `recorded-backend.ts`  | Replays recorded grids — tests and the three-way comparison                     |
| `segmentation.ts`      | Grid → geometric evidence. **The only file that knows ADE20K class names**      |
| `logits.ts`            | Argmax at logit resolution, then reduction to the grid                          |
| `answers.ts`           | Evidence → the six answers and normalized obstacles (Phase 13 "v1" thresholds) |
| `trust-policy.ts`      | What local evidence is *allowed to claim*                                       |
| `to-observation.ts`    | Normalized frame → the shared `SceneObservation`                                |
| `frame-source.ts`      | Pixel grab straight from the video — no image encoding per frame                |
| `controller.ts`        | The self-pacing loop                                                            |
| `grid-builders.ts`     | Hand-painted grids per fixture scene, for deterministic tests                    |

The normalized output contract (`FastObstacle`, `FastPerceptionFrame`) lives in
[`core/fast-perception.ts`](../core/fast-perception.ts), because `fusion`,
`decision` and the UI all read it.

## Rules

- **Model-specific shapes stop at this layer.** Tensors, class indices and
  ADE20K label strings never leave it. Everything above sees
  `FastPerceptionFrame`.
- **Local evidence can only add risk.** `sidewalk` and `traversable` can never
  escalate, whatever a trust policy says, and absence of evidence is `unknown`,
  never `clear`.
- **Never claims what it cannot see**: no terrain, no recommended action, no
  metre distances, no `very_near`, confidence capped at 0.6, uncertainty never
  `low`.
- **The Safety Engine still decides risk.** This layer only describes.
- **The loop yields.** It measures real inference cost and keeps its duty cycle
  at or below `1 / backoffFactor`, so it cannot starve camera capture, the UI or
  speech.

## Trust policy

Phase 13 measured very different reliability per question, so a deployment
declares which questions may raise risk:

| Question         | Recall | Precision | Default           |
| ---------------- | ------ | --------- | ----------------- |
| `stairs`         | 0.83   | 1.00      | may escalate      |
| `somethingAhead` | 0.91   | 0.63      | may escalate      |
| `largeObstacle`  | 0.70   | 0.33      | may escalate      |
| `blocked`        | 0.33   | 0.13      | **may not** force a stop |
| `sidewalk`       | —      | 1.00      | never escalatable |
| `traversable`    | —      | —         | never escalatable |

Under `CONSERVATIVE_TRUST_POLICY` the ceiling is `partially_blocked`
(→ `caution`): the conservative warning state, not a stop.
`STAIRS_ONLY_TRUST_POLICY` is the narrowest useful policy and the one ADR 0026
recommended starting from.

## Usage

```ts
const backend = await createOnnxBackend();            // throws if no weights
const source = new FastFrameSource(() => videoEl);
const controller = new FastPerceptionController({
  backend,
  grabFrame: (size) => source.grab(size),
});
controller.start();
controller.subscribe(() => {
  const { frame } = controller.getSnapshot();          // FastPerceptionFrame | null
});
```

In a live session the `NavigationSessionController` owns all of this; pass it a
`createFastBackend` factory rather than wiring the loop by hand.
