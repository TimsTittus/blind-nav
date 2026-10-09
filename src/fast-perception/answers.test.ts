import { describe, expect, it } from "vitest";
import { readSegmentation } from "./answers";
import { buildGrid, FIXTURE_GRIDS, openGround } from "./grid-builders";
import { GRID_H, GRID_W } from "./grid";
import { segRole } from "./segmentation";

const MAX_CONFIDENCE = 0.6;

describe("segRole", () => {
  it("treats known ground surfaces as walkable", () => {
    for (const label of ["sidewalk", "road", "floor", "grass", "path"]) {
      expect(segRole(label)).toBe("walkable");
    }
  });

  it("treats sky and ceiling as background, not obstacles", () => {
    expect(segRole("sky")).toBe("background");
    expect(segRole("ceiling")).toBe("background");
  });

  it("errs toward obstacle for an unrecognised class", () => {
    expect(segRole("some-class-we-have-never-seen")).toBe("obstacle");
  });

  it("ignores surrounding whitespace in class names", () => {
    expect(segRole("  sidewalk  ")).toBe("walkable");
  });
});

describe("readSegmentation", () => {
  it("reports nothing ahead on open ground", () => {
    const { answers } = readSegmentation(openGround(), MAX_CONFIDENCE);
    expect(answers.somethingAhead).toBe(false);
    expect(answers.blocked).toBe(false);
    expect(answers.traversable).toBe(true);
    expect(answers.sidewalk).toBe(true);
  });

  it("reports blocked when obstacles fill the corridor ahead", () => {
    const { answers } = readSegmentation(FIXTURE_GRIDS.blocked, MAX_CONFIDENCE);
    expect(answers.blocked).toBe(true);
    expect(answers.somethingAhead).toBe(true);
    // Traversable is vetoed by a blocked reading.
    expect(answers.traversable).toBe(false);
  });

  it("detects stairs and emits a stairs obstacle", () => {
    const { answers, obstacles } = readSegmentation(
      FIXTURE_GRIDS.stairs,
      MAX_CONFIDENCE,
    );
    expect(answers.stairs).toBe(true);
    expect(obstacles.some((o) => o.type === "stairs")).toBe(true);
  });

  it("cannot see a pothole, and says nothing rather than guessing", () => {
    const { answers } = readSegmentation(FIXTURE_GRIDS.pothole, MAX_CONFIDENCE);
    // Honest blind spot: no ADE20K class for road-surface defects.
    expect(answers.somethingAhead).toBe(false);
    expect(answers.stairs).toBe(false);
  });

  it("cannot see a kerb between two walkable surfaces", () => {
    const { answers } = readSegmentation(FIXTURE_GRIDS.curb, MAX_CONFIDENCE);
    expect(answers.somethingAhead).toBe(false);
  });

  it("never reports confidence above the cap", () => {
    for (const grid of Object.values(FIXTURE_GRIDS)) {
      const { obstacles } = readSegmentation(grid, MAX_CONFIDENCE);
      for (const obstacle of obstacles) {
        expect(obstacle.confidence).toBeLessThanOrEqual(MAX_CONFIDENCE);
      }
    }
  });

  it("never claims movement it cannot observe from one frame", () => {
    const { obstacles } = readSegmentation(
      FIXTURE_GRIDS.moving_person,
      MAX_CONFIDENCE,
    );
    expect(obstacles.length).toBeGreaterThan(0);
    for (const obstacle of obstacles) {
      expect(["unknown", "stationary"]).toContain(obstacle.movement);
    }
  });

  it("ignores obstacles outside the walking corridor", () => {
    // A wall filling the far left only; the corridor itself stays clear.
    const grid = buildGrid({
      base: "sky",
      bands: [
        { y0: 10, y1: GRID_H, label: "sidewalk" },
        { y0: 10, y1: GRID_H, x0: 0, x1: 8, label: "wall" },
      ],
    });
    expect(readSegmentation(grid, MAX_CONFIDENCE).answers.somethingAhead).toBe(
      false,
    );
  });

  it("tolerates a short or ragged grid without throwing", () => {
    const ragged = { classes: ["sky", "sidewalk"], grid: [[1, 1], [0]] };
    expect(() => readSegmentation(ragged, MAX_CONFIDENCE)).not.toThrow();
  });

  it("treats out-of-range class indices as unknown, not as ground", () => {
    const grid = {
      classes: ["sidewalk"],
      grid: Array.from({ length: GRID_H }, () =>
        Array.from({ length: GRID_W }, () => 99),
      ),
    };
    const { answers } = readSegmentation(grid, MAX_CONFIDENCE);
    // "unknown" is an obstacle role, so this must not read as traversable.
    expect(answers.traversable).toBe(false);
  });
});
