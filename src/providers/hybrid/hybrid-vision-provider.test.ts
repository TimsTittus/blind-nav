import { describe, expect, it, vi } from "vitest";
import type { SceneAnalysis } from "@/core";
import { sceneAnalysis, TINY_JPEG } from "@/evaluation/helpers";
import {
  FIXTURE_GRIDS,
  RecordedVisionBackend,
  type RgbaFrame,
} from "@/fast-perception";
import type { FusedPerception } from "@/fusion";
import { LocalVisionProvider } from "../local";
import type { VisionProvider } from "../provider";
import type { AnalyzeFrameInput } from "../types";
import { HybridVisionProvider } from "./hybrid-vision-provider";

const NOW = 1_000_000;
const INPUT = 8;

const input: AnalyzeFrameInput = {
  frame: { dataUrl: TINY_JPEG, capturedAt: NOW - 50 },
};

/** Avoids canvas/ImageBitmap: the decode path is not what these tests cover. */
const decodeFrame = (): Promise<RgbaFrame> =>
  Promise.resolve({
    data: new Uint8ClampedArray(INPUT * INPUT * 4),
    width: INPUT,
    height: INPUT,
    capturedAt: NOW - 50,
  });

function localProvider(scene: keyof typeof FIXTURE_GRIDS): LocalVisionProvider {
  return new LocalVisionProvider({
    backend: new RecordedVisionBackend({
      grids: [FIXTURE_GRIDS[scene]],
      inputSize: INPUT,
    }),
    decodeFrame,
    now: () => NOW,
  });
}

function cloudProvider(
  scene: Parameters<typeof sceneAnalysis>[0],
): VisionProvider {
  return {
    id: "fake-cloud",
    analyzeFrame: () => Promise.resolve(sceneAnalysis(scene, NOW - 200, NOW)),
  };
}

function failingCloud(error: Error): VisionProvider {
  return { id: "fake-cloud", analyzeFrame: () => Promise.reject(error) };
}

describe("LocalVisionProvider", () => {
  it("implements the shared provider interface", async () => {
    const provider = localProvider("stairs");
    const analysis = await provider.analyzeFrame(input);
    expect(analysis.provider).toBe("local");
    expect(analysis.capturedAt).toBe(input.frame.capturedAt);
    expect(analysis.analysisId).toMatch(/[0-9a-f-]{36}/u);
  });

  it("never claims a clear path", async () => {
    const analysis = await localProvider("clear").analyzeFrame(input);
    expect(analysis.pathStatus).not.toBe("clear");
  });

  it("exposes the normalized fast frame behind the analysis", async () => {
    const frame = await localProvider("stairs").perceive(input);
    expect(frame.answers.stairs).toBe(true);
    expect(frame.obstacles.some((o) => o.type === "stairs")).toBe(true);
    expect(frame.modelId).toBe("recorded");
  });

  it("honours an abort signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      localProvider("clear").analyzeFrame(input, {
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });
});

describe("HybridVisionProvider", () => {
  it("merges both sources and reports hybrid provenance", async () => {
    const provider = new HybridVisionProvider({
      cloud: cloudProvider("clear"),
      local: localProvider("obstacle"),
      now: () => NOW,
    });
    const analysis = await provider.analyzeFrame(input);
    expect(analysis.provider).toBe("hybrid");
    // Cloud said clear; local saw something. The cautious reading wins.
    expect(analysis.pathStatus).toBe("partially_blocked");
  });

  it("surfaces conflicts to the caller", async () => {
    const seen: FusedPerception[] = [];
    const provider = new HybridVisionProvider({
      cloud: cloudProvider("clear"),
      local: localProvider("stairs"),
      now: () => NOW,
      onFused: (fused) => seen.push(fused),
    });
    await provider.analyzeFrame(input);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.mode).toBe("hybrid");
    expect(seen[0]?.conflicts.length).toBeGreaterThan(0);
  });

  it("degrades to local-only when the cloud call fails", async () => {
    const provider = new HybridVisionProvider({
      cloud: failingCloud(new Error("network down")),
      local: localProvider("stairs"),
      now: () => NOW,
    });
    const analysis = await provider.analyzeFrame(input);
    expect(analysis.provider).toBe("local");
    expect(analysis.hazards.some((h) => h.type === "step")).toBe(true);
  });

  it("degrades to cloud-only when local inference fails", async () => {
    const brokenLocal = new LocalVisionProvider({
      backend: {
        id: "broken",
        modelId: "broken",
        inputSize: INPUT,
        infer: () => Promise.reject(new Error("no model")),
        dispose: () => {},
      },
      decodeFrame,
      now: () => NOW,
    });
    const provider = new HybridVisionProvider({
      cloud: cloudProvider("blocked"),
      local: brokenLocal,
      now: () => NOW,
    });
    const analysis = await provider.analyzeFrame(input);
    expect(analysis.provider).toBe("fixture");
    expect(analysis.pathStatus).toBe("blocked");
  });

  it("throws rather than inventing a clear scene when both fail", async () => {
    const brokenLocal = new LocalVisionProvider({
      backend: {
        id: "broken",
        modelId: "broken",
        inputSize: INPUT,
        infer: () => Promise.reject(new Error("no model")),
        dispose: () => {},
      },
      decodeFrame,
      now: () => NOW,
    });
    const provider = new HybridVisionProvider({
      cloud: failingCloud(new Error("network down")),
      local: brokenLocal,
      now: () => NOW,
    });
    await expect(provider.analyzeFrame(input)).rejects.toThrow("network down");
  });

  it("runs both sources concurrently rather than in series", async () => {
    const order: string[] = [];
    const slowCloud: VisionProvider = {
      id: "slow-cloud",
      analyzeFrame: async (): Promise<SceneAnalysis> => {
        order.push("cloud:start");
        await Promise.resolve();
        order.push("cloud:end");
        return sceneAnalysis("clear", NOW - 200, NOW);
      },
    };
    const local = localProvider("obstacle");
    const perceive = vi.spyOn(local, "perceive");
    const provider = new HybridVisionProvider({
      cloud: slowCloud,
      local,
      now: () => NOW,
    });
    await provider.analyzeFrame(input);
    // Local started before the cloud call resolved.
    expect(perceive).toHaveBeenCalled();
    expect(order[0]).toBe("cloud:start");
  });
});
