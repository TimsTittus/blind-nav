# Local CV spike (Phase 13)

Research code for evaluating local computer-vision models for fast obstacle
awareness. **Not part of the production app**: it is excluded from the root
`tsconfig`, ESLint, and Vitest, and nothing in `src/` imports it.

Findings and recommendation: [`docs/local-cv-evaluation.md`](../../docs/local-cv-evaluation.md).

## Layout

| Path                           | Purpose                                                             |
| ------------------------------ | ------------------------------------------------------------------- |
| `data/manifest.json`           | 40 Wikimedia Commons images, fixture scene + six hand labels each   |
| `data/ATTRIBUTION.md`          | Generated attribution for the images                                |
| `src/candidates.ts`            | Models evaluated (license, training data, input size)               |
| `src/runners.ts`               | Loads a candidate; uniform `run(image)` with stage timings          |
| `src/fast-answers.ts`          | Model output → six tri-state answers (v1 a-priori, v2 post-hoc)     |
| `src/local-observation.ts`     | Answers → conservative `SceneObservation`                           |
| `src/local-vision-provider.ts` | Prototype `LocalVisionProvider` (implements `VisionProvider`)       |
| `src/hybrid.ts`                | Prototype hybrid merge policy (local can only add risk)             |
| `tools/export_seaformer.py`    | Standalone (mmcv-free) SeaFormer-S → ONNX export                    |
| `browser/`                     | In-browser WASM/WebGPU benchmark page                               |
| `results/`                     | Summaries (`evaluation.*`, `interleaved-t4.json`, `browser-*.json`) |

## Reproduce

```bash
cd spikes/local-cv
bun install                 # postinstalls stay blocked; CPU inference needs none
bun run fetch-images        # ~16 MB of CC-licensed photos into data/images/

# SeaFormer weights are not on the Hugging Face Hub; export them once
# (needs Python 3.12 + CPU torch, onnx, onnxruntime, gdown, pillow, numpy):
git clone --depth 1 https://github.com/fudan-zvg/SeaFormer /tmp/seaformer
gdown 1hGXFVc7F-vLAKe3BLjqnS06_8Fo7CO-L -O /tmp/seaformer_s_ade.pth   # SeaFormer-S ADE20K 512 (4x8)
python -I tools/export_seaformer.py /tmp/seaformer/seaformer-seg /tmp/seaformer_s_ade.pth models data/images/blocked-2.jpg
python -I -c "from onnxruntime.quantization import quantize_dynamic as q, QuantType as T; [q(f'models/seaformer_s_ade_{s}.onnx', f'models/seaformer_s_ade_{s}_q8.onnx', weight_type=T.QUInt8) for s in (512, 384)]"

bun run benchmark           # per-model processes; writes results/raw/*.json
bun run interleaved         # same-conditions latency comparison
bun run evaluate            # accuracy + Safety Engine comparison
bun test                    # invariants of the local mapping and hybrid merge

bun run serve-browser &     # http://127.0.0.1:4317
bun scripts/browser-run.ts chromium            # headless: WASM only
bun scripts/browser-run.ts --headed chromium   # real-GPU WebGPU (opens a window)
```

Absolute latencies depend heavily on the host's power state; compare models
with `interleaved`, not across separate runs.
