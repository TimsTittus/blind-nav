# Testing Guide

Practical guide to running and extending the test suite. See [evaluation.md](evaluation.md) for the evaluation framework that measures system quality.

## Running tests

```bash
bun run test              # run all tests once
bun run test:watch        # re-run on file change
bun run test:coverage     # coverage report
bun run check             # format + lint + typecheck + test (full CI gate)
```

## Test infrastructure

| Tool | Role |
|------|------|
| [Vitest](https://vitest.dev/) 5 | Test runner, assertion library |
| `@testing-library/react` | React component tests |
| `jsdom` | Browser API polyfill (default environment) |
| `FixtureVisionProvider` | Canned AI responses — no API key needed |

No real cameras, AI models, network, or GPS are required to run any test.

## Test file conventions

- **Unit tests** live beside their source file: `foo.ts` → `foo.test.ts`.
- **Evaluation tests** live in `src/evaluation/` with the suffix `.eval.test.ts`.
- **Benchmarks** live in `src/performance/benchmark.test.ts`.
- Tests import from the module barrel (`@/safety`, `@/providers`, etc.), not deep paths.

## Fixture scenes

`src/providers/fixture/fixtures.ts` contains 16 canned `SceneObservation` entries used throughout the test suite. They let the full pipeline be exercised in every meaningful safety state without a camera or API key.

| Scene ID | Description | Expected safety level |
|----------|-------------|----------------------|
| `clear` | Open even sidewalk | safe |
| `clear_road` | Open road, no obstacles | safe |
| `puddle` | Puddle on path | caution |
| `pothole` | Pothole ahead | danger |
| `obstacle` | Pole right + approaching person left | caution |
| `parked_vehicle` | Parked car partially blocking | caution |
| `moving_person` | Pedestrian approaching head-on | caution |
| `stairs` | Descending stairs | danger |
| `stairs_up` | Ascending stairs | danger |
| `curb` | Kerb drop ahead | caution |
| `wall` | Wall directly ahead | critical |
| `narrow_path` | Narrow corridor, barriers both sides | caution |
| `road_crossing` | Street crossing with oncoming vehicle | danger |
| `blocked` | Barrier blocking full path | critical |
| `uncertain` | Very low confidence, dark/blurry | caution |
| `low_light` | Low-light, cannot assess scene | caution |

## Test categories

### Unit tests (by module)

- `src/core/` — schema validation, error types, session
- `src/camera/` — FrameCapture, FrameScheduler, CameraController, WebP detection
- `src/perception/` — image decoding, analysis contract, PerceptionController
- `src/safety/` — SafetyEngine (73 table-driven cases), rules, fusion
- `src/navigation/` — geo-math, heading, LocationController, route tracking
- `src/speech/` — SpeechEngine, priority queue, duplicate suppression, WebTTSProvider
- `src/decision/` — NavigationSessionController, SpeechDispatch, SceneQueryHandler
- `src/providers/` — FixtureVisionProvider, GeminiVisionProvider schema, normalization
- `src/performance/` — PerformanceMonitor, pipeline benchmark
- `src/voice/` — VoiceInput (SpeechRecognition, push-to-talk)

### Evaluation tests (`src/evaluation/`)

See [evaluation.md](evaluation.md) for full detail. Quick reference:

| File | Category | Key assertions |
|------|----------|----------------|
| `scene-understanding.eval.test.ts` | 1 & 2 | sceneType, pathStatus, obstacles, hazards, zero false negatives |
| `safety-decisions.eval.test.ts` | 3 | safety floor per scene, critical scenes never safe |
| `speech-behavior.eval.test.ts` | 4 & 5 | dispatch priority, queue ordering, duplicate suppression |
| `latency.eval.test.ts` | 6 | p95 thresholds: analyze <20ms, safety <5ms, dispatch <2ms |
| `reliability.eval.test.ts` | 7 | 10 failure scenarios, each returns typed error + perceptionStatus=unavailable |
| `security.eval.test.ts` | — | API key not NEXT_PUBLIC_, oversized image, invalid MIME, malformed JSON |
| `privacy.eval.test.ts` | — | No frame storage, no hidden upload, no image console log, no coord log |

## Adding a new fixture scene

1. Add an entry to `FIXTURE_SCENES` in `src/providers/fixture/fixtures.ts`.
2. Add the scene's expected safety floor to `SAFETY_FLOOR` in `src/evaluation/types.ts`.
3. If the scene is safety-critical, add it to `MUST_NOT_BE_SAFE`.
4. The scene will automatically be included in the benchmark (`bun run test`).

## Mocking patterns

### Provide a fake camera source

```typescript
const { capture } = setup({ videoWidth: 1920, videoHeight: 1080, readyState: 4 });
```

### Provide a throwing provider

```typescript
const handler = createAnalyzeHandler({
  resolveProvider: () => ({ id: "stub", analyzeFrame: () => Promise.reject(new TimeoutError()) }),
});
```

### Fake TTS provider

```typescript
const spoken: string[] = [];
const provider = { speak: (text) => spoken.push(text), stop: vi.fn(), … };
const engine = new SpeechEngine({ provider, settings: DEFAULT_VOICE_SETTINGS });
```

## Known test environment limitations

- `HTMLCanvasElement.toBlob()` is not implemented in jsdom. Tests that need it inject a mock canvas factory (see `FrameCapture` tests).
- `SpeechRecognition` is not available in jsdom; `VoiceInput` tests mock `window.SpeechRecognition`.
- Real Gemini AI calls are never made in tests; use `FixtureVisionProvider` or a mock handler.
