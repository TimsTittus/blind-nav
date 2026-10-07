import { describe, expect, it } from "vitest";
import { SceneAnalysisSchema } from "@/core";
import type { AnalyzeFrameInput } from "../types";
import { FixtureVisionProvider } from "./fixture-provider";
import { FIXTURE_SCENE_IDS } from "./fixtures";

const INPUT: AnalyzeFrameInput = {
  frame: { dataUrl: "data:,", capturedAt: 1_700_000_000_000 },
  context: { mode: "navigate" },
};

describe("FixtureVisionProvider", () => {
  it("returns a valid, normalized SceneAnalysis for every fixture", async () => {
    for (const scene of FIXTURE_SCENE_IDS) {
      const provider = new FixtureVisionProvider({ scene });
      const result = await provider.analyzeFrame(INPUT);
      expect(SceneAnalysisSchema.safeParse(result).success).toBe(true);
      expect(result.provider).toBe("fixture");
      expect(result.capturedAt).toBe(INPUT.frame.capturedAt);
    }
  });

  it("keeps the uncertain scene honest (ambiguous, path unknown)", async () => {
    const result = await new FixtureVisionProvider({
      scene: "uncertain",
    }).analyzeFrame(INPUT);
    expect(result.availability).toBe("ambiguous");
    expect(result.pathStatus).toBe("unknown");
  });

  it("honours a per-frame scenario context hint over its configured scene", async () => {
    const provider = new FixtureVisionProvider({ scene: "clear" });
    const result = await provider.analyzeFrame({
      ...INPUT,
      context: { mode: "navigate", scenario: "blocked" },
    });
    expect(result.pathStatus).toBe("blocked");
  });

  it("rejects when the abort signal fires during its delay", async () => {
    const provider = new FixtureVisionProvider({ scene: "clear", delayMs: 50 });
    const ac = new AbortController();
    const promise = provider.analyzeFrame(INPUT, { signal: ac.signal });
    ac.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });
});
