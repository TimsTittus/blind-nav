# Local fast perception (Phase 14)

How on-device computer vision is wired into the navigation loop, what it is
trusted to claim, and what is still unverified.

Background: [`docs/local-cv-evaluation.md`](local-cv-evaluation.md) (the Phase 13
evaluation that chose the model), ADR 0026 and ADR 0027 in
[`docs/decisions.md`](decisions.md).

## 1. What changed

Gemini is no longer the only thing looking at the camera. A small segmentation
model now runs locally, several times a second, and its findings are merged with
Gemini's before the Safety Engine sees anything.

```
camera (≈30 FPS capture capability)
  │
  ├─► FastPerceptionController ──► FastPerception     ≈6.7 FPS target, self-paced
  │     (src/fast-perception)       (FastPerceptionFrame)
  │                                        │
  └─► PerceptionController ─────► SceneUnderstanding  ≈1 FPS, unchanged
        (src/perception → /api/vision/analyze → Gemini)
                                           │
                             fusePerception(cloud, local)
                                           │
                                  SafetyEngine (unchanged)
                                           │
                                   SpeechDispatch
```

**Gemini is not replaced.** Remove the local model and the app behaves exactly
as it did in Phase 13.

## 2. Install the weights

No model ships with the app. The SeaFormer code is Apache-2.0 but its published
weights are ADE20K-trained, and that licence review is still open (ADR 0026 §5),
so weights are never committed or deployed.

```bash
bun run models:install     # copies the Phase 13 export into public/models/
bun run dev
bun run models:clean       # remove them again
```

`public/models/` is gitignored, so a clean checkout has no weights and any build
from git produces none (`next build` copies nothing from `public/` into
`.next`). `models:install` is a development convenience, **not** a deployment
step: a deploy that copies a developer's working tree wholesale would carry the
weights with it.

Without a model installed:

- `createOnnxBackend()` rejects with `LocalBackendUnavailableError`.
- The session keeps running **cloud-only**; nothing breaks.
- The capability panel reports "On-device vision — unavailable: No local model
  installed."

A different model is configured, not coded:

```ts
createOnnxBackend({ modelUrl: "/models/my-export.onnx", inputSize: 512 });
```

## 3. Frequencies

| Stage           | Target  | Where                                    |
| --------------- | ------- | ---------------------------------------- |
| Camera capture  | ~30 FPS | device capability, not a loop            |
| Local inference | 150 ms (≈6.7 FPS) | `FAST_PERCEPTION_CONFIG.targetIntervalMs` |
| Cloud analysis  | 1000 ms (1 FPS)   | `SESSION_CONTROLLER_CONFIG.analysisIntervalMs` |

These are **starting targets, not validated settings. No frame rate here has
been shown to be safe on any device.**

The loop paces itself rather than trusting the target: the interval is raised so
inference never occupies more than `1 / backoffFactor` (default ½) of
wall-clock time. A device needing 300 ms per frame runs at 600 ms, not 150 ms.
When even `maxIntervalMs` is not sustainable, `deviceTooSlow` is set and the
loop keeps running at its slowest rate rather than pretending.

## 4. What local perception may claim

See the trust-policy table in
[`src/fast-perception/README.md`](../src/fast-perception/README.md). In short,
under the shipped default:

- `stairs` → raises a step hazard. Phase 13's one production-grade signal.
- `somethingAhead`, `largeObstacle` → raise the path to `partially_blocked`.
- `blocked` → **recorded but not allowed to force a stop** (precision 0.13).
- `sidewalk`, `traversable` → can never reduce risk. Structurally impossible.

Ceiling under the default policy is `caution`, never a stop. The local model can
therefore wake the system up, but cannot by itself stop the user.

## 5. Conflict

Disagreements are represented, not resolved away. A conflict, or perception
resting on local evidence alone, means the system **never reports `safe`** and
always marks the assessment `degraded`. Neither source is preferred by identity;
only freshness and caution decide. See
[`src/fusion/README.md`](../src/fusion/README.md).

## 6. Measurements

### Verified in this phase

Real SeaFormer-S weights, through the production `OnnxVisionBackend`, WASM
single-threaded, on an x86 laptop CPU (`powersave`, on battery), 384² input,
five real photos from the Phase 13 dataset:

| Image           | Model time | Local reading                      | After trust policy  |
| --------------- | ---------- | ---------------------------------- | ------------------- |
| `clear-1`       | 138 ms     | nothing ahead                      | `unknown`           |
| `stairs-1`      | 118 ms     | stairs, sidewalk                   | `partially_blocked` + step hazard |
| `blocked-2`     | 104 ms     | something ahead                    | `partially_blocked` |
| `wall-1`        | 105 ms     | **blocked**                        | `partially_blocked` (stop withheld) |
| `narrow_path-1` | 104 ms     | **blocked** (known false alarm)    | `partially_blocked` (stop withheld) |

The last two rows are the trust policy doing its job: `wall-1` is a genuine
barrier and `narrow_path-1` is walkable, and the local model cannot tell them
apart — so neither is allowed to force a stop.

### Cloud-only vs local-only vs hybrid

From `src/evaluation/hybrid-comparison.eval.test.ts`, all 16 fixture scenes
through the real Safety Engine against the Phase-11 `SAFETY_FLOOR`:

| Arm         | Meets floor | False negatives | False positives | Must-not-be-safe violations | Conflicts |
| ----------- | ----------- | --------------- | --------------- | --------------------------- | --------- |
| cloud-only  | 16/16       | 0               | 3               | 0                           | 0         |
| local-only  | 12/16       | 4               | 0               | 0                           | 0         |
| hybrid      | 16/16       | 0               | 3               | 0                           | 4         |

Reading: **local-only is not viable** — it misses four scenes, including
potholes, kerbs and crossings, which have no segmentation class. **Hybrid
matches cloud-only's floor compliance, adds no new false stops, and surfaces
four conflicts** that cloud-only could not see. That is the whole case for the
architecture.

Caveat: the local arm runs on hand-painted grids (`FIXTURE_GRIDS`) that
reproduce the model's known blind spots. This measures pipeline behaviour, not
model accuracy. Real accuracy is in `docs/local-cv-evaluation.md` §5.

### Not measured

- **Any phone.** No Android, no iOS, no real-GPU WebGPU. This is the single
  biggest gap.
- **CPU and GPU utilisation.** `localDutyCycle` records the share of wall-clock
  time spent inside inference, which is a proxy for scheduling pressure, not a
  CPU measurement.
- **Memory.** `jsHeapMB` is whole-tab and Chromium-only; Phase 13's per-model
  RSS figures are Node, not browser.
- **Battery.** Not measurable from the browser. The Battery Status API is
  unavailable or deliberately coarse in current browsers, and polling it would
  itself cost power. Needs external measurement on a real device.

## 7. Cross-origin isolation

Multi-threaded WASM needs `SharedArrayBuffer`, which needs cross-origin
isolation, so `next.config.ts` sets:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

The app loads no third-party scripts, fonts or frames, so nothing is currently
affected. **Adding any cross-origin resource will need `crossorigin`
attributes and CORP headers on the other end.** Without isolation the backend
falls back to one thread — roughly 1.5× slower in Phase 13's measurements, and
reported in the capability panel rather than hidden.

## 8. Failure behaviour

| Failure                        | Result                                                              |
| ------------------------------ | ------------------------------------------------------------------- |
| No weights installed           | Cloud-only; capability panel says so                                |
| ORT or WebGPU unavailable      | WASM fallback, then cloud-only                                      |
| Backend finishes loading after the session stopped | Backend disposed, nothing started              |
| Inference throws               | Last frame **dropped** (never kept as current evidence), `error` state |
| Repeated inference failures    | Loop stops itself after `maxConsecutiveErrors`; cloud path unaffected |
| Camera not ready               | Grab error reported, loop continues                                 |
| Tab hidden                     | Loop pauses (inherited from `FrameScheduler`)                        |
| Session paused / stopped       | Loop pauses / disposes with the backend                             |
| Cloud fails, local works       | `local_only` → caution, never `safe`                                |
| Local fails, cloud works       | `cloud_only`, exactly Phase 8 behaviour                             |
| Both fail                      | `unknown`, degraded. Never "clear"                                   |

## 9. Still outstanding before this should be trusted

1. **Measure on real phones**, including WebGPU on real hardware.
2. **Resolve the weights licence**, or retrain/source weights whose terms allow
   the intended use.
3. **Collect a held-out dataset from the target viewpoint** (chest height,
   moving, forward-facing) with consent, and re-score.
4. **Attack `blocked`** — temporal smoothing across frames, or ground geometry
   from the orientation sensor — before any policy enables
   `allowBlockedAssertion`.
5. **Measure battery and thermal behaviour** on a phone over a realistic walk.
