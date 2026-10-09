# Local computer vision — Phase 13 evaluation

Status: **research spike, complete.** Nothing here is wired into the production
app. Gemini remains the only vision provider in the navigation loop. Spike code
lives in [`spikes/local-cv/`](../spikes/local-cv/README.md).

## 1. Recommendation (summary)

1. **Do not replace Gemini, and do not put local CV into the navigation loop
   yet.** On this evaluation, local models can reliably answer only a subset of
   the target questions.
2. **Best candidate for local fast perception: SeaFormer-S semantic
   segmentation (ADE20K weights, exported to ONNX).** It was the fastest model
   tested by a wide margin (≈5× faster than SegFormer-B0 under identical
   conditions), had the smallest memory footprint, runs in the browser on WASM,
   and was the strongest model for stairs. It was not chosen _because_ it was
   mentioned: it won clearly on latency and memory. On accuracy it was mixed
   against SegFormer-B0 (better on stairs, "something ahead" and sidewalk;
   equal on "blocked"; worse on large-obstacle recall, 0.70 vs 0.80).
3. **What local CV is good enough for today (on this data):** _stairs present_
   (recall 0.83, precision 1.00) and _sidewalk visible_ (precision 1.00). These
   are candidates for an **additive alarm** in a future hybrid provider.
4. **What it is not good enough for:** _path blocked_ and _large obstacle_. Every
   rule tried traded missed barriers against false STOPs (the a-priori rule
   missed 4 of 6 blocked scenes; the post-hoc rule that caught all 6 caused 21
   unnecessary STOPs in 40 images). Shipping that would either miss hazards or train users to ignore the
   system.
5. **Blocking issue before any production use: licensing.** The SeaFormer code
   is Apache-2.0, but both SeaFormer and SegFormer weights are trained on ADE20K,
   whose images are restricted to non-commercial research and education, and
   SegFormer's own license is non-commercial. A legal review of the weights is
   required.
6. **Not yet measured:** real phones and real-GPU WebGPU. All numbers below come
   from one laptop (Node CPU and desktop Chromium WASM). Phone and WebGPU
   measurements are the next step before any integration decision.

## 2. Method

### Criteria, and where each is answered

The brief listed twelve comparison criteria. Each is answered below; the basis
column separates what was **measured** on this hardware from what is a **desk
check** of documentation. Nothing here was decided on benchmark accuracy alone
(see recommendation 2).

| Criterion                     | Section     | Basis                                                       |
| ----------------------------- | ----------- | ----------------------------------------------------------- |
| Mobile / browser feasibility  | §4          | Measured in desktop Chromium; **no phone measured**         |
| Inference latency             | §4          | Measured (Node CPU, 1 and 4 threads; browser WASM)          |
| Model size                    | §3, §4      | Measured (ONNX file sizes, fp32 and int8)                   |
| Accuracy                      | §5, §6      | Measured on 40 hand-labelled images                         |
| Licensing                     | §3          | Desk check of model cards, repos and training-set terms     |
| Available pretrained weights  | §3          | Desk check, plus the SeaFormer export done here             |
| WebGPU support                | §4, §3.1    | Backend available in ORT-Web; **not measured on a real GPU** |
| ONNX / TensorFlow.js support  | §3.1        | ONNX measured; TensorFlow.js desk check only                |
| CPU fallback                  | §4          | Measured (WASM in browser, ORT CPU in Node, single-thread)  |
| Memory requirements           | §4          | Measured (RSS after load and peak)                          |
| Ease of deployment            | §3.2        | Observed while building this spike                          |
| Suitability for outdoor scenes | §5.1       | Measured; all 40 test images are outdoor street-level        |

### Target questions

The local model only needs to answer six fast, yes/no questions about the
walking corridor ahead: _something directly ahead? walking area blocked?
sidewalk? staircase? large obstacle? path traversable?_ No instructions, no
free text.

### Test data

- **40 photos** from Wikimedia Commons (CC0, CC BY, CC BY-SA; attribution in
  [`spikes/local-cv/data/ATTRIBUTION.md`](../spikes/local-cv/data/ATTRIBUTION.md)),
  2–3 per fixture scene so every one of the 16 Phase-11 fixture scenes is
  covered.
- **Hand labels** for the six questions, by a single annotator
  ([`data/manifest.json`](../spikes/local-cv/data/manifest.json)).
- **Limitations:** small sample; one annotator; photos are not taken from the
  target viewpoint (chest-height, forward-facing, moving camera); single frames,
  no temporal context. Results rank candidates and expose failure modes; they do
  **not** certify accuracy.

### Comparison with the Gemini fixture set

No Gemini API key was configured, so live Gemini was **not** run on these
images. Instead each image inherits its fixture scene's **safety floor**
(`SAFETY_FLOOR` from `src/evaluation/types.ts`), and the local result is put
through the real deterministic `SafetyEngine` and compared against that floor and
against the fixture observation (the "ideal Gemini" answer, which meets 40/40 by
construction).

### Rules (and how they were tuned)

- **v1** — thresholds fixed before any scoring.
- **v2** — designed after inspecting v1 failures **on the same 40 images**.
  Its scores are optimistic and need held-out validation.

## 3. Candidates

ONNX Runtime was used as the single runtime: every candidate has ONNX weights,
and ONNX Runtime Web provides WebGPU, WASM (CPU) and WebNN backends behind one
API. TensorFlow.js was not evaluated.

| Candidate                    | Category         | Weights license (checked on model card / repo)                                        | Weights size (fp32 / int8) | Notes                                                                                                                                                 |
| ---------------------------- | ---------------- | ------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SeaFormer-S** (ADE20K)     | Segmentation     | Code Apache-2.0; weights on Google Drive/Baidu without separate terms; ADE20K-trained | 16.0 / 4.6 MB              | No ONNX on the Hub; exported here via a vendored, mmcv-free script (exact parity with PyTorch)                                                        |
| SegFormer-B0 (ADE20K)        | Segmentation     | NVIDIA Source Code License — **non-commercial**                                       | 15.3 / 4.4 MB              | Ready-made ONNX (transformers.js)                                                                                                                     |
| DeepLabV3-MobileViT-S        | Segmentation     | Apple sample-code license                                                             | —                          | VOC classes (no sidewalk/stairs); unsupported by transformers.js v4 segmentation pipeline. Dropped                                                    |
| RF-DETR nano                 | Detection (COCO) | Apache-2.0                                                                            | 108 / 28.8 MB              | Worked well on people and cars                                                                                                                        |
| D-FINE-S                     | Detection (COCO) | Apache-2.0                                                                            | 41.5 / 11.2 MB             | Worked well                                                                                                                                           |
| D-FINE-N                     | Detection (COCO) | Apache-2.0                                                                            | 15.3 / 4.5 MB              | **Community ONNX export produced degenerate output** (duplicate boxes on one object, missed people filling the frame). Excluded; would need re-export |
| RT-DETRv2-R18                | Detection (COCO) | Apache-2.0                                                                            | 81 / 21 MB                 | Slowest usable detector                                                                                                                               |
| YOLOS-tiny                   | Detection (COCO) | Apache-2.0                                                                            | 26 / 9.7 MB                | ViT at high resolution: ~3 s/frame, >2 GB RSS. Unsuitable                                                                                             |
| YOLOv10n / Ultralytics YOLO  | Detection        | **AGPL-3.0**                                                                          | —                          | Not benchmarked: license incompatible with a closed or app-store deployment without a commercial license                                              |
| **Depth Anything V2 Small**  | Relative depth   | Apache-2.0                                                                            | 99 / 27 MB                 | Relative depth only — never metric                                                                                                                    |
| Depth Anything V2 Base/Large | Relative depth   | **CC-BY-NC-4.0**                                                                      | —                          | Not benchmarked (non-commercial)                                                                                                                      |

COCO detectors cover people, vehicles, bicycles, animals and some street
furniture, but **not** walls, barriers, stairs, curbs or potholes. ADE20K
segmentation covers sidewalk, road, stairs, wall, fence, pole and similar classes,
which is why it maps better onto the target questions.

**Pose / geometry estimation** was not prototyped. The geometry the rules need
(where the ground is, how the camera is pitched) is cheaper to get from the
device's orientation sensor (`DeviceOrientationEvent`, already covered by the
Phase-12 capability layer) than from a model. Revisit once the camera mounting is
fixed.

### 3.1 Runtime support: ONNX vs TensorFlow.js

ONNX Runtime was the only runtime benchmarked, and TensorFlow.js was rejected on
a desk check rather than measured. The reasoning:

- **ONNX covers the whole candidate set.** Every candidate except SeaFormer-S
  has ready-made ONNX weights; SeaFormer-S was exported here. ONNX Runtime Web
  then offers WebGPU, WASM (CPU) and WebNN behind one API, so the GPU path and
  the CPU fallback need no second code path.
- **No ready-made TensorFlow.js weights were found for any shortlisted
  candidate** (SeaFormer-S, SegFormer-B0, Depth Anything V2-S, RF-DETR nano,
  D-FINE, RT-DETRv2). This was a Hub/npm search, not an exhaustive one.
- **The TensorFlow.js model zoo does not cover these questions well.** Its
  maintained segmentation offerings are DeepLab v3 and person/body segmentation
  (BodyPix, MediaPipe selfie segmentation); detection is COCO-SSD /
  EfficientDet-Lite, i.e. the same COCO classes that §3 shows miss walls,
  barriers, stairs and curbs. Only the DeepLab v3 ADE20K variant is on-target,
  and it is an older, heavier backbone than SeaFormer-S. Current maintenance
  status of those packages was not verified.
- **Converting would cost a second export pipeline.** PyTorch →
  SavedModel/Keras → `tensorflowjs_converter`, where unsupported ops are a known
  failure mode for transformer-style models. We already have to maintain one
  export path (for SeaFormer); a second runtime would add work and shrink the
  candidate set.

Conclusion: no reason to add TensorFlow.js. This is a desk assessment — if ORT-Web
WebGPU turns out to be unusable on real phones (§4), TensorFlow.js with DeepLab v3
is the fallback worth measuring, not a current recommendation.

### 3.2 Ease of deployment

Effort observed while building the spike, lowest first:

- **Hub ONNX models (SegFormer-B0, RF-DETR, D-FINE, RT-DETRv2, Depth Anything
  V2-S, YOLOS): lowest effort** — install, fetch, run. But community exports
  cannot be trusted blind: the D-FINE-N export produced degenerate output
  (duplicate boxes, missed people filling the frame) and had to be excluded. Any
  export needs validating against the reference implementation before use.
- **SeaFormer-S: highest effort, and the recommendation depends on it.** No ONNX
  on the Hub; weights published only via Google Drive/Baidu; the official repo
  needs `mmcv`/`mmsegmentation`. It took a vendored, mmcv-free export script
  ([`tools/export_seaformer.py`](../spikes/local-cv/tools/export_seaformer.py))
  checked for numerical parity with PyTorch. Production use means **hosting our
  own ONNX file**, which is exactly what the licensing review in §8 must cover.
- **Pre/post-processing is ours either way.** The `transformers.js` pipeline is
  convenient but unusable for real time (§4), so each model is run as a direct
  ORT session with our own resize/normalise/argmax. Modest, and already written.
- **Two app-level costs for browser deployment**, neither yet paid: WASM threads
  need **cross-origin isolation** (COOP/COEP response headers, a Next.js-wide
  change that can break third-party embeds), and 16–99 MB of weights need a
  caching decision against the Phase-12 service worker, which currently
  precaches a small offline shell.
- **DeepLabV3-MobileViT-S was dropped partly on deployment grounds**: VOC classes
  plus no support in the `transformers.js` v4 segmentation pipeline.

## 4. Latency and memory

Host: x86 laptop CPU (12 cores, NVIDIA RTX 4050 not used), running **on battery
with the `powersave` governor**. An earlier run on AC power was 2–3× faster for
most models, so treat absolute numbers as indicative only. The _interleaved_
benchmark runs all models round-robin in one process, so relative numbers are
comparable.

### Node, ONNX Runtime CPU, 4 threads, interleaved (same conditions, 80 samples each)

| Model                    | Input          | Median ms | p95 ms | vs SeaFormer-S 512 |
| ------------------------ | -------------- | --------- | ------ | ------------------ |
| **SeaFormer-S fp32**     | 384²           | **30.4**  | 38.2   | 0.61×              |
| **SeaFormer-S fp32**     | 512²           | **49.8**  | 59.3   | 1.00×              |
| SegFormer-B0 fp32        | 384²           | 144.1     | 159.7  | 2.9×               |
| SegFormer-B0 fp32        | 512²           | 264.2     | 299.5  | 5.3×               |
| RF-DETR nano int8        | 384²           | 238.8     | 257.3  | 4.8×               |
| D-FINE-S int8            | 640²           | 365.1     | 385.6  | 7.3×               |
| RT-DETRv2-R18 int8       | 640²           | 549.1     | 583.4  | 11.0×              |
| Depth Anything V2-S fp32 | 266 short side | 319.7     | 412.3  | 6.4×               |
| Depth Anything V2-S fp32 | 518 short side | 1471.8    | 2050.1 | 29.6×              |

### Single thread (rough low-end proxy, separate processes, battery)

SeaFormer-S 512: 60 ms · SeaFormer-S 384: 38 ms · SegFormer-B0 512: 464 ms ·
RF-DETR nano int8: 473 ms · Depth Anything V2-S 266: 633 ms.

### Desktop Chromium 153, onnxruntime-web 1.30, WASM (4 threads, cross-origin isolated)

| Model                            | Median ms     | p95 ms         |
| -------------------------------- | ------------- | -------------- |
| SeaFormer-S fp32 512             | 98.8          | 128.1          |
| SeaFormer-S fp32 384             | 63.6          | 79.9           |
| SegFormer-B0 fp32 512            | 447.6         | 545.5          |
| RF-DETR nano fp32 / int8         | 643.8 / 446.1 | 1001.4 / 545.2 |
| D-FINE-S int8                    | 566.5         | 753.0          |
| Depth Anything V2-S fp32 266×350 | 808.3         | 1076.9         |

All seven models loaded and ran in the browser. **WebGPU was not measured on
real hardware:** headless Chromium only exposed a software (SwiftShader)
adapter, which the benchmark detects and skips rather than report. Run
`bun scripts/browser-run.ts --headed chromium` on a machine or phone with a real
GPU to fill this in.

### Memory and model size (Node, separate processes)

| Model                        | File    | RSS after load → peak |
| ---------------------------- | ------- | --------------------- |
| SeaFormer-S fp32 512         | 16.0 MB | 170 → 303 MB          |
| SegFormer-B0 fp32 512        | 15.3 MB | 162 → 680 MB          |
| RF-DETR nano int8            | 28.8 MB | 188 → 372 MB          |
| D-FINE-S int8                | 11.2 MB | 157 → 456 MB          |
| Depth Anything V2-S fp32 266 | 99.1 MB | 279 → 500 MB          |

### Other findings

- **Dynamic int8 quantization made conv-heavy models slower on x86** (SeaFormer
  50 → 105 ms) while cutting size 3.5×. Static (QDQ) quantization, and ARM/WASM
  behaviour, are untested.
- **The transformers.js segmentation pipeline is unusable for real time** as-is:
  it upsamples all 150 class masks to full image resolution (SegFormer: 1.5 s,
  3 GB RSS). Taking the argmax at logit resolution brings post-processing down to
  ~4–12 ms.
- **ONNX Runtime threads busy-spin by default.** With several models in one
  page or process, idle sessions starve the active one. Spinning must be
  disabled (`session.intra_op.allow_spinning = "0"`) in any hybrid setup.

## 5. Accuracy against the hand labels (40 images)

"Dangerous" is the error direction that hurts the user: a missed hazard, or
claiming _sidewalk_ or _traversable_ when it isn't.

| Configuration                    | Ahead rec | Blocked rec / prec | Sidewalk prec | Stairs rec / prec | Large obst. rec | Traversable prec | Dangerous errors |
| -------------------------------- | --------- | ------------------ | ------------- | ----------------- | --------------- | ---------------- | ---------------- |
| [v1] SeaFormer-S 512             | 0.91      | 0.33 / 0.13        | 1.00          | **0.83 / 1.00**   | 0.70            | 0.83             | 14               |
| [v1] SegFormer-B0 512            | 0.82      | 0.33 / 0.15        | 0.95          | 0.67 / 1.00       | 0.80            | 0.85             | 17               |
| [v1] SeaFormer + RF-DETR         | 0.91      | 0.33 / 0.12        | 1.00          | 0.83 / 1.00       | 0.70            | 0.83             | 14               |
| [v1] RF-DETR nano alone          | 0.41      | (rarely answers)   | —             | —                 | 0.30            | —                | 20               |
| [v1] Depth Anything 266 alone    | 0.09      | —                  | —             | —                 | —               | —                | 20               |
| [v2] SeaFormer alone             | 0.91      | **1.00** / 0.19    | 1.00          | 0.83 / 1.00       | 0.70            | 1.00             | 6                |
| [v2] SeaFormer + depth           | 0.91      | 0.33 / 0.25        | 1.00          | 0.83 / 1.00       | 0.70            | 0.87             | 14               |
| [v2] SeaFormer + RF-DETR + depth | 0.91      | 0.50 / 0.30        | 1.00          | 0.83 / 1.00       | 0.70            | 0.90             | 12               |
| [v2] SegFormer + RF-DETR + depth | 0.86      | 0.67 / 0.40        | 0.95          | 0.67 / 1.00       | 0.80            | 0.93             | 12               |

Full per-question confusion counts: `spikes/local-cv/results/evaluation.txt`.

What the numbers mean:

- **Stairs** are the clearest local win. Segmentation finds them with no false
  positives on this set.
- **"Blocked" has no good operating point with single-frame heuristics.**
  Segmentation can see that walkable ground ends at an obstacle, but cannot tell
  a barrier 3 m ahead from trees where a road recedes into the distance. Adding
  relative depth removed most false alarms but also re-missed the barriers.
  This is the core open problem for local perception.
- **Detectors alone are weak on these questions**, because most hazards here
  (walls, barriers, stairs, potholes) are not COCO classes. They are reliable
  for people and vehicles when they work (RF-DETR scored ≥ 0.99 on people
  filling the frame).
- **Depth alone answers almost nothing usefully** with a simple ratio
  heuristic.

### 5.1 Suitability for outdoor scenes

All 40 test images are outdoor, street-level scenes — the 16 fixture scenes are
all outdoor navigation — so every number in this document is an outdoor number.
There is no indoor comparison, and none is claimed. Breaking the Safety Engine
results (§6) down by scene shows *which* outdoor conditions fail, as
`floor misses / unnecessary STOPs / images`:

| Scene           | [v1] SeaFormer-S | [v2] SeaFormer + RF-DETR | Outdoor-specific reading                                      |
| --------------- | ---------------- | ------------------------ | ------------------------------------------------------------- |
| `stairs`, `stairs_up` | 0 / 0 / 6  | 0 / 0 / 6                | Outdoor steps are the clear win; no false positives           |
| `narrow_path`   | 0 / **3** / 3    | 0 / **3** / 3            | Walkable-but-narrow outdoor paths always read as impassable   |
| `pothole`       | **2** / 0 / 3    | **2** / 0 / 3            | No ADE20K class; road-surface defects are invisible to it     |
| `puddle`        | 0 / 1 / 2        | 0 / 2 / 2                | Wet surfaces/reflections confuse the ground mask              |
| `road_crossing` | **1** / 0 / 2    | 0 / 0 / 2                | Crossings need semantics (signals, markings) — cloud's job    |
| `wall`, `blocked` | **4** / 0 / 5  | 0 / 0 / 5                | v2 catches them only by over-stopping everywhere else         |
| `low_light`     | 0 / 1 / 3        | 0 / **3** / 3            | Dusk/low sun degrades the mask into false alarms              |
| `clear`, `clear_road` | 0 / 3 / 5  | 0 / 3 / 5                | Open outdoor horizons are mistaken for obstruction            |
| `parked_vehicle`, `moving_person` | 0 / 2 / 5 | 0 / 5 / 5     | Detectors fire correctly, but the rules escalate too readily  |

Three scenes are omitted from the table because neither configuration misses
their floor: `curb` (0 / 0 / 2 under v1, 0 / 1 / 2 under v2), `obstacle`
(0 / 0 / 2, 0 / 2 / 2) and `uncertain` (0 / 1 / 2, 0 / 2 / 2). Including them,
the over-stop counts sum to the 11 and 21 reported in §6.

Outdoor-specific conclusions:

- **Open sky and receding roads are the core problem.** The same cue that marks a
  real barrier — walkable ground ending — also marks a road vanishing at the
  horizon or trees at the end of a street. That is why `clear`, `clear_road` and
  `narrow_path` over-stop while `wall` and `blocked` get missed.
- **Outdoor lighting range is unmeasured risk.** `low_light` degrades sharply
  under the more sensitive v2 rules (1 → 3 over-stops of 3). Direct sun, glare and
  night were not tested at all.
- **Road-surface hazards are out of reach of ADE20K segmentation.** Potholes,
  puddles and crossings have no class, and stay cloud responsibilities.
- **Viewpoint caveat applies most here**: these are photographer-framed outdoor
  photos, not chest-height footage from a moving walker, so outdoor horizon
  geometry in real use will differ (§2, §8).

## 6. Through the Safety Engine (vs. fixture floors)

| Configuration                    | Meets fixture floor | Said SAFE | `MUST_NOT_BE_SAFE` violations | STOP where floor < danger |
| -------------------------------- | ------------------- | --------- | ----------------------------- | ------------------------- |
| Fixture ("ideal Gemini")         | 40/40               | —         | 0                             | —                         |
| [v1] SeaFormer-S                 | 33/40               | 0         | 0                             | 11                        |
| [v1] SeaFormer + RF-DETR         | 33/40               | 0         | 0                             | 13                        |
| [v1] SegFormer + RF-DETR         | 34/40               | 0         | 0                             | 12                        |
| [v2] SeaFormer + RF-DETR         | 38/40               | 0         | 0                             | **21**                    |
| [v2] SeaFormer + RF-DETR + depth | 33/40               | 0         | 0                             | 7                         |
| [v2] SegFormer + RF-DETR + depth | 34/40               | 0         | 0                             | 6                         |

- **The conservative mapping held:** no configuration ever produced `safe`, and
  there were no violations on stairs, walls, blocked paths, crossings or
  potholes. This is by design: the local provider never reports
  `pathStatus: "clear"`, never fills `recommendedImmediateAction`, never
  reports terrain, and caps confidence at 0.6.
- **Potholes and road crossings were always below floor.** No local model has a
  class for them. These remain cloud (Gemini) responsibilities.
- **Below-floor results land on `caution`, never on `safe`/`unknown`**, so the
  degradation is "less urgent than it should be", not "falsely reassuring". That
  is still a real miss for walls and barriers.

## 7. Architecture

`LocalVisionProvider` implements the existing `VisionProvider` interface
unchanged ([`spikes/local-cv/src/local-vision-provider.ts`](../spikes/local-cv/src/local-vision-provider.ts)),
so the abstraction holds. Two consequences for a future integration:

- **It runs in the browser, not on the server.** Today `VisionProvider`
  implementations are instantiated only in the server route handler. A local
  provider would be created client-side and called by the perception controller
  directly. The interface types are shared; the place of construction differs.
- **The hybrid merge is a pure function** ([`src/hybrid.ts`](../spikes/local-cv/src/hybrid.ts))
  with these invariants:

```
Camera ─┬─ local fast perception (every frame it can afford)
        └─ cloud semantic reasoning (throttled, as today)
                   │
                   ▼
   mergeObservations(cloud, cloudAge, local) ──► Safety Engine (unchanged)
```

- Local evidence can only **add** risk: it adds obstacles and hazards and can
  worsen `pathStatus`, but never improves it, never removes cloud findings,
  and never lowers uncertainty.
- Local "no evidence" is `unknown`, never `clear`.
- A stale or missing cloud result falls back to the local observation, not to
  "clear".
- The Safety Engine stays the only component that decides risk.

## 8. Risks and limitations

- Laptop-only measurements; no phone, no real-GPU WebGPU numbers.
- Small, single-annotator, off-viewpoint test set; v2 rules tuned on it.
- Weights licensing (ADE20K, NVIDIA non-commercial) unresolved.
- SeaFormer weights are only distributed via Google Drive/Baidu. Production use
  would mean hosting our own exported ONNX file, which the licensing review must
  cover.
- A local model running every frame competes with camera capture, the UI and
  speech for CPU/GPU and battery. That cost is unmeasured on phones.

## 9. Recommended next steps (not started)

1. **Measure on real phones**: Chromium WebGPU and WASM, iOS Safari WASM, using
   the existing browser benchmark page.
2. **Collect a small held-out dataset from the target viewpoint**, with consent
   and recorded in the project's privacy terms, and re-score v1/v2 on it.
3. **Resolve weights licensing**, or identify segmentation weights trained on
   data whose terms allow the intended use.
4. Try **temporal smoothing** (require N consecutive frames) and
   **orientation-sensor ground geometry** to attack the "blocked" ambiguity.
5. Evaluate **static int8 (QDQ)** quantization and fp16 on WebGPU.
6. Only then consider a `HybridVisionProvider` behind a development flag,
   starting with the stairs alarm alone.

## 10. Reproduce

See [`spikes/local-cv/README.md`](../spikes/local-cv/README.md).
