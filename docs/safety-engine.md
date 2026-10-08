# Safety Engine

Deterministic safety assessment from perception, location, and navigation
context. The engine applies explicit, auditable rules — it never asks a model
whether something is safe.

**This is an assistive prototype. It does not guarantee obstacle or collision
avoidance and must never claim to.**

## Core principle

The generative AI model **describes** the world (perception). The Safety Engine
**decides** risk. Missing, stale, low-confidence, or ambiguous perception is
treated as degraded — never as "clear".

## Safety levels

| Level      | Meaning                                             |
| ---------- | --------------------------------------------------- |
| `unknown`  | Cannot determine safety (default / degraded state)  |
| `safe`     | No threats detected, perception is reliable          |
| `caution`  | Obstacle or hazard nearby; user should take care     |
| `danger`   | Significant threat; stop or avoid                    |
| `critical` | Immediate danger; stop now                           |

## Safety actions

| Action                | When used                                             |
| --------------------- | ----------------------------------------------------- |
| `none`                | Unknown state — no action can be recommended          |
| `continue`            | Path is clear                                         |
| `continue_cautiously` | Minor obstacle or uncertain path                      |
| `slow_down`           | Obstacle ahead at medium distance or partially blocked|
| `move_left`           | Obstacle/hazard on the right                          |
| `move_right`          | Obstacle/hazard on the left                           |
| `stop`                | Immediate danger or path blocked                      |

## Input: SafetyContext

```
sceneAnalysis    — validated SceneAnalysis from perception (or null)
location         — latest GPS fix (or null)
heading          — latest heading (or null)
route            — current Route (or null)
currentRouteStep — active RouteStep (or null)
now              — current timestamp
```

## Output: SafetyAssessment

```
level            — unknown | safe | caution | danger | critical
action           — none | continue | continue_cautiously | slow_down | move_left | move_right | stop
reasons          — list of human-readable reasons
confidence       — 0–1
basedOnAnalysisId — links to the SceneAnalysis used
assessedAt       — when this assessment was made
expiresAt        — after this time, treat as UNKNOWN
degraded         — true if data quality is poor
```

## Decision rules

### Perception unavailability

| Condition                      | Result              |
| ------------------------------ | ------------------- |
| No scene analysis              | UNKNOWN             |
| Perception availability=error  | UNKNOWN             |
| Perception availability=unavailable | UNKNOWN        |
| Perception data older than 10s | UNKNOWN (stale)     |

### Obstacle rules

| Position | Distance   | Severity      | Level    | Action      |
| -------- | ---------- | ------------- | -------- | ----------- |
| center   | very_near  | high/critical | CRITICAL | STOP        |
| center   | near       | high/critical | DANGER   | STOP        |
| center   | near       | medium        | CAUTION  | SLOW_DOWN   |
| center   | medium     | high/critical | CAUTION  | SLOW_DOWN   |
| center   | any        | approaching   | CAUTION  | SLOW_DOWN   |
| right    | near       | high/critical | CAUTION  | MOVE_LEFT   |
| left     | near       | high/critical | CAUTION  | MOVE_RIGHT  |
| right    | near       | medium        | CAUTION  | CONTINUE_CAUTIOUSLY |
| any      | far        | low           | SAFE     | CONTINUE    |

`unknown` distance is treated as `near` (conservative). `unknown` severity is
treated as `medium`.

### Hazard rules

| Position | Severity      | Level    | Action              |
| -------- | ------------- | -------- | ------------------- |
| center   | high/critical | CRITICAL | STOP                |
| lateral  | high/critical | DANGER   | MOVE_LEFT/RIGHT     |
| any      | medium        | CAUTION  | CONTINUE_CAUTIOUSLY |
| any      | low           | SAFE     | CONTINUE            |

### Path status

| Status            | Level    | Action              |
| ----------------- | -------- | ------------------- |
| blocked           | CRITICAL | STOP                |
| partially_blocked | CAUTION  | SLOW_DOWN           |
| clear             | SAFE     | CONTINUE            |
| unknown           | CAUTION  | CONTINUE_CAUTIOUSLY |

### Aggregation

When multiple obstacles/hazards are present, the **worst** signal wins. If
obstacles appear on both left and right at close range (conflicting), the engine
returns DANGER + STOP (cannot safely move in either direction).

### Uncertainty penalty

When overall confidence is below 0.3 or uncertainty is `high`, a `safe` result
is promoted to at least `caution`, and confidence is capped to the scene's
overall confidence.

### Ambiguous perception

When scene availability is `ambiguous`, a `safe` result is promoted to `caution`
with `continue_cautiously`.

## Assessment expiry

Every assessment carries an `expiresAt` timestamp (default: 3 seconds after
creation). After expiry the assessment must be treated as `unknown`.
`SafetyEngine.isExpired()` checks this.

## Navigation fusion

The safety engine can **suppress** a route instruction when an immediate hazard
exists in the direction the instruction would send the user.

| Route instruction | Perception                       | Result                                       |
| ----------------- | -------------------------------- | -------------------------------------------- |
| Turn right        | Right side blocked (near, high)  | Suppress turn; "Right side appears blocked."  |
| Turn left         | Left side blocked (near, high)   | Suppress turn; "Left side appears blocked."   |
| Turn right        | Center blocked                   | Suppress turn                                |
| Any               | Safe                             | No suppression                               |

The engine never invents an alternative route direction without evidence. It can
say stop, slow down, continue cautiously, or move left/right (when perception
supports it), but it does not reroute.

## Stale location

When location data is older than 15 seconds, the assessment is marked `degraded`
and the reason "Location data is stale" is included. This does not change the
safety level — location staleness is informational for the Decision Engine.

## Configuration

| Parameter            | Default  | Description                          |
| -------------------- | -------- | ------------------------------------ |
| `perceptionStaleMs`  | 10,000   | Scene analysis age before "stale"    |
| `locationStaleMs`    | 15,000   | Location fix age before "stale"      |
| `assessmentTtlMs`    | 3,000    | Assessment validity window           |
| `lowConfidenceThreshold` | 0.3  | Below this, uncertainty penalty applies |

## What this engine does NOT do

- It does not call any AI model or network service.
- It does not fabricate precise distances in meters (the system has no depth
  sensor).
- It does not guarantee collision avoidance.
- It does not produce speech output (that is the Speech Engine's job, driven by
  the Decision Engine).
- It does not implement ML or learning — rules are deterministic.
