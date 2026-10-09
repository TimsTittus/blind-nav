/**
 * Category 1 & 2: Scene understanding and hazard detection evaluation.
 *
 * Tests that every fixture scene produces the expected obstacles, hazards,
 * pathStatus, and sceneType from the FixtureVisionProvider. These serve as
 * regression anchors — if fixture output changes unexpectedly the test fails.
 *
 * Scoring uses TP/FP/FN/TN so the summary surfaces false negatives (the most
 * dangerous failure mode for an assistive system).
 */
import { describe, expect, it } from "vitest";
import { FixtureVisionProvider } from "@/providers/fixture/fixture-provider";
import {
  FIXTURE_SCENE_IDS,
  FIXTURE_SCENES,
  type FixtureSceneId,
} from "@/providers/fixture/fixtures";
import { summarize, type EvalResult } from "./types";

const FRAME = {
  dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/",
  capturedAt: 1_000_000,
};

async function analyzeScene(id: FixtureSceneId) {
  const provider = new FixtureVisionProvider({ delayMs: 0, scene: id });
  return provider.analyzeFrame({ frame: FRAME });
}

describe("Category 1 — Scene type classification", () => {
  it("every fixture scene returns the expected sceneType", async () => {
    for (const id of FIXTURE_SCENE_IDS) {
      const analysis = await analyzeScene(id);
      expect(`${id}:${analysis.sceneType}`).toBe(
        `${id}:${FIXTURE_SCENES[id].sceneType}`,
      );
    }
  });

  it("every fixture scene returns the expected pathStatus", async () => {
    for (const id of FIXTURE_SCENE_IDS) {
      const analysis = await analyzeScene(id);
      expect(`${id}:${analysis.pathStatus}`).toBe(
        `${id}:${FIXTURE_SCENES[id].pathStatus}`,
      );
    }
  });

  it("every fixture scene returns the expected terrain", async () => {
    for (const id of FIXTURE_SCENE_IDS) {
      const analysis = await analyzeScene(id);
      expect(`${id}:${analysis.terrain}`).toBe(
        `${id}:${FIXTURE_SCENES[id].terrain}`,
      );
    }
  });
});

describe("Category 2 — Object / hazard detection", () => {
  const results: EvalResult[] = [];

  it("clear scenes have no obstacles", async () => {
    for (const id of ["clear", "clear_road"] as FixtureSceneId[]) {
      const analysis = await analyzeScene(id);
      const hasObstacles = analysis.obstacles.length > 0;
      results.push({
        scene: id,
        aspect: "no_obstacles_on_clear_path",
        outcome: hasObstacles ? "false_positive" : "true_negative",
      });
      if (analysis.obstacles.length !== 0)
        throw new Error(
          `scene=${id}: expected no obstacles, got ${analysis.obstacles.length}`,
        );
    }
  });

  it("hazardous scenes detect at least one obstacle or hazard", async () => {
    const hazardousScenes: FixtureSceneId[] = [
      "puddle",
      "pothole",
      "obstacle",
      "parked_vehicle",
      "moving_person",
      "stairs",
      "stairs_up",
      "curb",
      "wall",
      "narrow_path",
      "road_crossing",
      "blocked",
    ];
    for (const id of hazardousScenes) {
      const analysis = await analyzeScene(id);
      const detected =
        analysis.obstacles.length > 0 || analysis.hazards.length > 0;
      results.push({
        scene: id,
        aspect: "obstacle_or_hazard_detected",
        outcome: detected ? "true_positive" : "false_negative",
      });
      if (!detected)
        throw new Error(`scene=${id}: should detect obstacles/hazards`);
    }
  });

  it("uncertain/low-light scenes produce no false confident detections", async () => {
    for (const id of ["uncertain", "low_light"] as FixtureSceneId[]) {
      const analysis = await analyzeScene(id);
      results.push({
        scene: id,
        aspect: "high_uncertainty_acknowledged",
        outcome:
          analysis.uncertainty === "high" ? "true_positive" : "false_negative",
      });
      expect(`${id}:${analysis.uncertainty}`).toBe(`${id}:high`);
      expect(analysis.overallConfidence).toBeLessThan(0.4);
    }
  });

  it("pothole scene reports a pothole obstacle", async () => {
    const analysis = await analyzeScene("pothole");
    const pothole = analysis.obstacles.find((o) => o.type === "pothole");
    results.push({
      scene: "pothole",
      aspect: "pothole_type_detected",
      outcome: pothole ? "true_positive" : "false_negative",
    });
    expect(pothole, "pothole obstacle should be present").toBeDefined();
  });

  it("wall scene reports a wall obstacle at very_near distance", async () => {
    const analysis = await analyzeScene("wall");
    const wall = analysis.obstacles.find((o) => o.type === "wall");
    results.push({
      scene: "wall",
      aspect: "wall_obstacle_very_near",
      outcome:
        wall?.relativeDistance === "very_near"
          ? "true_positive"
          : "false_negative",
    });
    expect(wall).toBeDefined();
    expect(wall?.relativeDistance).toBe("very_near");
  });

  it("stairs scenes report a stairs obstacle", async () => {
    for (const id of ["stairs", "stairs_up"] as FixtureSceneId[]) {
      const analysis = await analyzeScene(id);
      const stairsObs = analysis.obstacles.find((o) => o.type === "stairs");
      results.push({
        scene: id,
        aspect: "stairs_obstacle_detected",
        outcome: stairsObs ? "true_positive" : "false_negative",
      });
      if (!stairsObs)
        throw new Error(`scene=${id}: should have stairs obstacle`);
    }
  });

  it("moving_person scene reports an approaching person", async () => {
    const analysis = await analyzeScene("moving_person");
    const person = analysis.obstacles.find(
      (o) => o.type === "person" && o.movement === "approaching",
    );
    results.push({
      scene: "moving_person",
      aspect: "approaching_person_detected",
      outcome: person ? "true_positive" : "false_negative",
    });
    expect(person, "approaching person should be detected").toBeDefined();
  });

  it("road_crossing scene reports a vehicle hazard", async () => {
    const analysis = await analyzeScene("road_crossing");
    const vehicleHazard = analysis.hazards.find((h) => h.type === "vehicle");
    results.push({
      scene: "road_crossing",
      aspect: "vehicle_hazard_at_crossing",
      outcome: vehicleHazard ? "true_positive" : "false_negative",
    });
    expect(
      vehicleHazard,
      "vehicle hazard should be present at road crossing",
    ).toBeDefined();
  });

  it("narrow_path scene reports obstacles on both sides", async () => {
    const analysis = await analyzeScene("narrow_path");
    const leftObs = analysis.obstacles.some((o) => o.position === "left");
    const rightObs = analysis.obstacles.some((o) => o.position === "right");
    results.push({
      scene: "narrow_path",
      aspect: "bilateral_obstacles_for_narrow_path",
      outcome: leftObs && rightObs ? "true_positive" : "false_negative",
    });
    expect(
      leftObs && rightObs,
      "narrow path should have left and right obstacles",
    ).toBe(true);
  });

  it("prints detection evaluation summary", () => {
    const summary = summarize(results);
    console.log(
      "\n── Scene Understanding / Object Detection ──\n" +
        `  TP=${summary.truePositives}  FP=${summary.falsePositives}  ` +
        `FN=${summary.falseNegatives}  TN=${summary.trueNegatives}\n` +
        `  Precision=${summary.precision.toFixed(2)}  Recall=${summary.recall.toFixed(2)}  ` +
        `FN-rate=${summary.fnRate.toFixed(2)}  (n=${summary.total})\n`,
    );
    // Zero false negatives is the goal for safety-critical detection.
    expect(
      summary.falseNegatives,
      "False negatives in detection indicate missed hazards",
    ).toBe(0);
  });
});
