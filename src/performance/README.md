# Performance

Development-only metrics for the real-time pipeline. Collects timing data
across camera capture, AI analysis, safety assessment, and speech dispatch
without sending any telemetry externally.

## Metrics

| Metric              | Source                          |
| ------------------- | ------------------------------- |
| cameraFPS           | Frame capture timestamps        |
| captureLatencyMs    | Canvas draw + encode            |
| aiLatencyMs         | Round-trip to vision endpoint   |
| aiRequestsPerMinute | Sliding 60 s window             |
| aiFailureRate       | Failures / total in window      |
| perceptionAgeMs     | Time since last AI result       |
| gpsAccuracy         | Last GeolocationPosition        |
| gpsAgeMs            | Time since last GPS fix         |
| speechQueueLength   | Current TTS queue depth         |
| endToEndLatencyMs   | Frame capture → speech dispatch |
| localFPS / localLatencyMs / localMedianLatencyMs | On-device inference (Phase 14) |
| localFailureRate    | Local inference failures / attempts |
| localDutyCycle      | Share of wall-clock time inside local inference |
| jsHeapMB            | Whole-tab JS heap; Chromium-only, `null` elsewhere |

## Boundaries

- Timestamp arrays bounded at 300 entries (5 min at 1 FPS).
- Pruned every 30 s.
- No external telemetry. All data stays in-process.
