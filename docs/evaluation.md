# Evaluation Framework

How this prototype is evaluated, what metrics matter, and how to interpret results.

> **Scope:** This document covers the repeatable automated evaluation added in Phase 11. It does not cover live field testing or certified safety validation, which are out of scope for this browser prototype.

## Motivation

"It seemed to work" is not sufficient for an assistive system. Every code change must be verifiable against explicit quality criteria. This framework provides:

- Objective pass/fail criteria per scenario
- A TP/FP/FN/TN breakdown with emphasis on **false negatives** (the most dangerous failure mode)
- Latency budgets for each pipeline stage
- Regression anchors for every layer of the deterministic stack

## Test categories

### Category 1 — Scene type classification

**File:** `src/evaluation/scene-understanding.eval.test.ts`

Verifies that every fixture scene returns the exact `sceneType`, `pathStatus`, and `terrain` defined for it. This is a regression anchor: if fixture output changes unexpectedly, the test fails before any downstream layer is affected.

### Category 2 — Object / hazard detection

**File:** `src/evaluation/scene-understanding.eval.test.ts`

Checks obstacle and hazard presence against ground-truth fixture metadata.

**Scoring:**

| Outcome | Meaning |
|---------|---------|
| TP | Hazardous scene correctly detected obstacles/hazards |
| FP | Clear scene incorrectly reports obstacles |
| FN | Hazardous scene **missed** — highest concern |
| TN | Clear scene correctly reports no obstacles |

**Zero false negatives is the goal.** A false negative in an assistive navigation system means a hazard was not announced, which could lead to collision or fall.

### Category 3 — Safety decision

**File:** `src/evaluation/safety-decisions.eval.test.ts`

Evaluates the deterministic `SafetyEngine` against a `SAFETY_FLOOR` table that defines the minimum acceptable safety level for each scene. The engine must never assess a critical-hazard scene as `"safe"` or `"unknown"`.

**Safety floor table** (excerpt):

| Scene | Minimum level |
|-------|--------------|
| `wall` | critical |
| `blocked` | critical |
| `stairs`, `stairs_up` | danger |
| `road_crossing` | danger |
| `pothole` | danger |
| `puddle`, `curb`, `obstacle` | caution |
| `uncertain`, `low_light` | caution |
| `clear`, `clear_road` | safe |

### Category 4 — Navigation instruction

Navigation instruction tests are covered by the `SpeechDispatch` and `NavigationSessionController` unit tests (`src/decision/`). Phase 11 integration tests exercise the dispatch priority assignment and fusion override mechanism.

### Category 5 — Speech behavior

**File:** `src/evaluation/speech-behavior.eval.test.ts`

Four sub-categories:

- **5a Priority assignment:** critical → `critical` priority, danger → `high` priority, fusion override dispatched at `high`.
- **5b Queue ordering:** higher-priority items dequeue first; same-priority items preserve insertion order; `critical` interrupts lower-priority speech.
- **5c Duplicate suppression:** identical messages within the per-priority cooldown window are dropped; messages beyond the cooldown are accepted.
- **5d Control:** disabled engine rejects all speech; `stop()` clears queue and current speech.

### Category 6 — Latency

**File:** `src/evaluation/latency.eval.test.ts`

Measures p95 timing across 20 iterations for each stage using fixture data (no I/O):

| Stage | p95 threshold |
|-------|--------------|
| Fixture AI analysis | < 20 ms |
| Safety assessment | < 5 ms |
| Speech dispatch | < 2 ms |
| Combined pipeline | < 30 ms |

These are regression thresholds, not production targets. Real latency depends on network, device, and AI provider. The combined threshold (30 ms) leaves ~9970 ms of a 10 s timeout budget for the actual Gemini call.

### Category 7 — Failure handling

**File:** `src/evaluation/reliability.eval.test.ts`

Ten failure scenarios, each verified to:
1. Return a typed `AppError` (never an unhandled rejection)
2. Set `perceptionStatus: "unavailable"` (never silently imply the path is clear)
3. Return the correct HTTP status code

| # | Scenario | Expected HTTP | Error code |
|---|----------|--------------|-----------|
| 1 | Network disconnect | 502 | `network` |
| 2 | API timeout | 504 | `timeout` |
| 3 | Rate limit | 429 | `rate_limited` |
| 4 | Invalid AI response | 502 | `ai_error` |
| 5 | GPS unavailable | n/a (local) | `permission_denied` |
| 6 | Camera permission denied | 500 | `permission_denied` |
| 7 | Microphone / speech unavailable | n/a (local) | `permission_denied` |
| 8 | Tab backgrounding (abort) | n/a | `AbortError` |
| 9 | Device rotation | n/a | — (dimensions adapt) |
| 10 | Session cancellation | 503 | `unavailable` |

## Security tests

**File:** `src/evaluation/security.eval.test.ts`

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | API key not client-side | No `NEXT_PUBLIC_*` key variable; server env has no public secret keys |
| 2 | Malicious payload | Empty body, missing fields, prototype injection, deeply nested object — all 400 or sanitised |
| 3 | Oversized image | Image > 4 MB returns 400 |
| 4 | Invalid MIME type | `image/gif`, `text/html`, plain URL — all rejected before any model call |
| 5 | Malformed JSON | Non-JSON, array, null, string body — all return 400 |
| 6 | Adversarial AI output | Zod validates every field; invalid enum, out-of-range confidence, oversized description, too many obstacles — all rejected |

## Privacy tests

**File:** `src/evaluation/privacy.eval.test.ts`

| # | Check | Method |
|---|-------|--------|
| 1 | Frames not persisted | Spy on `localStorage.setItem`; verify no data URL stored |
| 2 | No hidden upload | `ANALYZE_ENDPOINT` is a relative internal path; `fetch` only called with internal URL |
| 3 | No console image logging | Spy on `console.log/warn/debug`; verify no data URL in output |
| 4 | No sensitive location logging | Spy on console; verify GPS coordinates do not appear; verify `PerformanceMonitor` only stores accuracy, not coords |

## Evaluation metrics glossary

| Symbol | Definition |
|--------|-----------|
| TP | True positive — expected event occurred correctly |
| FP | False positive — event fired when it should not have |
| FN | False negative — expected event did NOT occur |
| TN | True negative — correctly no event |
| Precision | TP / (TP + FP) |
| Recall | TP / (TP + FN) |
| FN-rate | FN / (TP + FN) — target: 0 for safety-critical detection |

## Running the evaluation suite

```bash
bun run test src/evaluation  # evaluation tests only
bun run test                 # all tests (601 total)
```

Each evaluation file prints a summary table to the console when run. Example output:

```
── Scene Understanding / Object Detection ──
  TP=14  FP=0  FN=0  TN=2
  Precision=1.00  Recall=1.00  FN-rate=0.00  (n=16)

── Safety Decision Evaluation ──
  TP=22  FP=0  FN=0  TN=0
  Precision=1.00  Recall=1.00  FN-rate=0.00  (n=22)
```

## Limitations and what is not measured

- **Real model accuracy** is not tested here. Fixture scenes represent expected model output; actual Gemini responses may differ. Model accuracy requires a separate field-testing programme.
- **Latency thresholds** are measured on fixture data with no I/O. Real-world latency includes camera capture, network round-trip, and model inference.
- **Accessibility compliance** is verified at the ESLint level (`jsx-a11y`) but not by automated screen-reader testing.
- **End-to-end browser tests** are in `e2e/` (Playwright); they require a real browser.
