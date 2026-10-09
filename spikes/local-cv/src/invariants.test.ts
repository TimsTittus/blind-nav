import { describe, expect, it } from "bun:test";
import type { SceneObservation } from "@/core";
import { SceneObservationSchema } from "@/core";
import { fuse, NO_ANSWERS, type FastAnswers } from "./fast-answers";
import { CLOUD_FRESH_MS, mergeObservations } from "./hybrid";
import { LOCAL_MAX_CONFIDENCE, toSceneObservation } from "./local-observation";

const answers = (patch: Partial<FastAnswers>): FastAnswers => ({
  ...NO_ANSWERS,
  ...patch,
});

const cloud = (patch: Partial<SceneObservation> = {}): SceneObservation => ({
  sceneType: "sidewalk",
  pathStatus: "clear",
  terrain: "even",
  overallConfidence: 0.9,
  uncertainty: "low",
  obstacles: [],
  hazards: [],
  recommendedImmediateAction: "continue",
  description: "Clear sidewalk.",
  ...patch,
});

describe("toSceneObservation", () => {
  it("never claims a clear path when nothing was found", () => {
    const obs = toSceneObservation({
      answers: answers({
        somethingAhead: false,
        blocked: false,
        stairs: false,
        traversable: true,
      }),
      seg: null,
      detections: [],
    });
    expect(obs.pathStatus).toBe("unknown");
    expect(obs.recommendedImmediateAction).toBe("unknown");
    expect(obs.terrain).toBe("unknown");
    expect(SceneObservationSchema.safeParse(obs).success).toBe(true);
  });

  it("caps confidence and never reports low uncertainty", () => {
    const obs = toSceneObservation({
      answers: answers({ blocked: true }),
      seg: null,
      detections: [],
    });
    expect(obs.pathStatus).toBe("blocked");
    expect(obs.overallConfidence).toBeLessThanOrEqual(LOCAL_MAX_CONFIDENCE);
    expect(obs.uncertainty).not.toBe("low");
  });

  it("encodes stairs as a high-severity centre obstacle plus a step hazard", () => {
    const obs = toSceneObservation({
      answers: answers({ stairs: true }),
      seg: null,
      detections: [],
    });
    expect(
      obs.obstacles.some(
        (o) =>
          o.type === "stairs" &&
          o.position === "center" &&
          o.severity === "high",
      ),
    ).toBe(true);
    expect(obs.hazards.some((h) => h.type === "step")).toBe(true);
  });
});

describe("fuse", () => {
  it("lets any source raise a hazard", () => {
    const fused = fuse([
      answers({ blocked: false }),
      answers({ blocked: true }),
    ]);
    expect(fused.blocked).toBe(true);
    expect(fused.traversable).toBe(false);
  });

  it("stays unknown when no source can answer", () => {
    expect(fuse([NO_ANSWERS, NO_ANSWERS]).stairs).toBeNull();
  });
});

describe("mergeObservations", () => {
  const localUnknown = toSceneObservation({
    answers: NO_ANSWERS,
    seg: null,
    detections: [],
  });
  const localBlocked = toSceneObservation({
    answers: answers({ blocked: true }),
    seg: null,
    detections: [],
  });

  it("local 'no evidence' does not change a fresh cloud result", () => {
    const merged = mergeObservations(cloud(), 500, localUnknown);
    expect(merged.pathStatus).toBe("clear");
    expect(merged.uncertainty).toBe("low");
  });

  it("local evidence can worsen but never improve the cloud path status", () => {
    expect(mergeObservations(cloud(), 500, localBlocked).pathStatus).toBe(
      "blocked",
    );
    expect(
      mergeObservations(cloud({ pathStatus: "blocked" }), 500, localUnknown)
        .pathStatus,
    ).toBe("blocked");
  });

  it("keeps every cloud obstacle", () => {
    const withPole = cloud({
      obstacles: [
        {
          type: "pole",
          position: "left",
          relativeDistance: "near",
          severity: "medium",
          confidence: 0.8,
          movement: "stationary",
        },
      ],
    });
    expect(
      mergeObservations(withPole, 500, localBlocked).obstacles.some(
        (o) => o.type === "pole",
      ),
    ).toBe(true);
  });

  it("falls back to the local observation when the cloud result is stale", () => {
    const merged = mergeObservations(cloud(), CLOUD_FRESH_MS + 1, localUnknown);
    expect(merged.pathStatus).toBe("unknown");
    expect(merged.recommendedImmediateAction).toBe("unknown");
  });
});
