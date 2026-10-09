# `fusion/` — reconciling cloud and local perception

Merges the cloud provider's **scene understanding** with local
**fast perception** into one validated scene for the Safety Engine.

```
camera ─┬─ LocalVisionProvider  → FastPerception      (≈5–7 FPS target)
        └─ GeminiVisionProvider → SceneUnderstanding  (≈1 FPS)
                   │
                   ▼
         fusePerception(...)  ──►  Safety Engine
```

This is **vision-vs-vision** reconciliation only. Vision versus GPS/route stays
where it was, in [`decision/`](../decision/README.md), and safety still outranks
navigation convenience.

## Rules

1. **Neither source automatically wins.** Freshness decides whether a source is
   admissible at all. Where both are admissible and disagree, the *more
   cautious* reading is taken and the disagreement is **kept** in `conflicts`,
   not discarded.
2. **Local evidence can only add risk.** It may add obstacles and hazards and
   worsen `pathStatus`; it never improves it, never deletes a cloud finding,
   never lowers uncertainty and never raises confidence.
3. **Absence is never "clear".** A missing or stale cloud result falls back to
   local evidence, whose own absence of findings is `unknown`. With neither
   source admissible the analysis is `null`, which the Safety Engine already
   treats as `unknown` and degraded.
4. **Only the cloud makes semantic claims.** The merged scene keeps the cloud's
   description, terrain, scene type and recommended action, because those are
   claims the local model is not entitled to make.
5. **The merged scene is re-validated** through `normalizeSceneObservation`, the
   same Zod boundary every provider passes through.

## Modes

| Mode          | When                                      | Safety consequence                   |
| ------------- | ----------------------------------------- | ------------------------------------ |
| `hybrid`      | Both sources fresh                        | Conflicts floor the level at caution |
| `cloud_only`  | No usable local evidence                  | Unchanged from Phase 8               |
| `local_only`  | Cloud missing or stale                    | Never `safe`; degraded               |
| `none`        | Neither usable                            | `unknown`, degraded                  |

`local_only` is the case the Phase 14 brief calls out: local CV sees something
before the cloud has answered, and the system still enters a conservative
warning state.

## Conflict handling

A conflict is recorded whether or not it changed the outcome, and the Safety
Engine reads it through the deliberately minimal `PerceptionFusionInput` — so
`safety` never learns that local computer vision exists. Conflicted or
local-only perception is **never reported as `safe`**, and is always marked
`degraded`. It is *not* escalated to a stop: over-stopping teaches users to
ignore the system.

## Modules

| File        | Role                                                    |
| ----------- | ------------------------------------------------------- |
| `fuse.ts`   | `fusePerception()` — the merge and conflict detection   |
| `types.ts`  | `FusedPerception`, `PerceptionConflict`, source metadata |
| `config.ts` | Freshness windows (cloud 3 s, local 1 s)                |
