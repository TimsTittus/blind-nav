/**
 * Category 6: Latency evaluation.
 *
 * Measures wall-clock timing for each pipeline stage using fixture data so
 * no hardware or network is needed:
 *   capture → AI analysis (fixture)
 *   AI analysis → safety decision
 *   safety decision → speech dispatch
 *   total (end-to-end)
 *
 * Thresholds are deliberately generous (fixture provider, no I/O) to catch
 * catastrophic regressions rather than enforce target latencies that depend
 * on hardware or network conditions.
 */
import { describe, expect, it } from "vitest";
import type { SafetyAssessment } from "@/core";
import { SESSION_CONTROLLER_CONFIG } from "@/decision/config";
import { SpeechDispatch } from "@/decision/speech-dispatch";
import { FixtureVisionProvider } from "@/providers/fixture/fixture-provider";
import { SafetyEngine } from "@/safety";
import { safetyContext } from "./helpers";

const FRAME = {
  dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/",
  capturedAt: Date.now(),
};

const N = 20; // iterations for percentile stability

function percentile(sorted: number[], p: number): number {
  const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx]!;
}

async function measure(fn: () => Promise<void> | void): Promise<number> {
  const t = performance.now();
  await fn();
  return performance.now() - t;
}

describe("Category 6 — Latency", () => {
  it("fixture analyze: p95 < 20ms", async () => {
    const provider = new FixtureVisionProvider({
      delayMs: 0,
      scene: "obstacle",
    });
    const timings: number[] = [];

    for (let i = 0; i < N; i++) {
      timings.push(
        await measure(async () => {
          await provider.analyzeFrame({
            frame: { ...FRAME, capturedAt: Date.now() },
          });
        }),
      );
    }
    timings.sort((a, b) => a - b);
    const p95 = percentile(timings, 95);
    console.log(`  fixture-analyze p95=${p95.toFixed(2)}ms (n=${N})`);
    expect(p95).toBeLessThan(20);
  });

  it("safety assess: p95 < 5ms", () => {
    const engine = new SafetyEngine();
    const timings: number[] = [];

    for (let i = 0; i < N; i++) {
      const ctx = safetyContext("obstacle", Date.now());
      const t = performance.now();
      engine.assess(ctx);
      timings.push(performance.now() - t);
    }
    timings.sort((a, b) => a - b);
    const p95 = percentile(timings, 95);
    console.log(`  safety-assess p95=${p95.toFixed(2)}ms (n=${N})`);
    expect(p95).toBeLessThan(5);
  });

  it("speech dispatch: p95 < 2ms", () => {
    const spoken: string[] = [];
    const sink = {
      speak: (text: string) => {
        spoken.push(text);
      },
    };
    const dispatch = new SpeechDispatch(SESSION_CONTROLLER_CONFIG, sink);
    const assessment: SafetyAssessment = {
      level: "danger",
      action: "stop",
      reasons: ["obstacle ahead"],
      confidence: 0.85,
      assessedAt: 1_000_000,
      expiresAt: 1_005_000,
      degraded: false,
    };

    const timings: number[] = [];
    for (let i = 0; i < N; i++) {
      const t = performance.now();
      dispatch.onSafetyUpdate(assessment, null, 1_000_000 + i * 10_000);
      timings.push(performance.now() - t);
    }
    timings.sort((a, b) => a - b);
    const p95 = percentile(timings, 95);
    console.log(`  speech-dispatch p95=${p95.toFixed(2)}ms (n=${N})`);
    expect(p95).toBeLessThan(2);
  });

  it("combined fixture-pipeline: p95 < 30ms", async () => {
    const provider = new FixtureVisionProvider({ delayMs: 0 });
    const engine = new SafetyEngine();
    const spoken: string[] = [];
    const sink = {
      speak: (text: string) => {
        spoken.push(text);
      },
    };
    const dispatch = new SpeechDispatch(SESSION_CONTROLLER_CONFIG, sink);

    const timings: number[] = [];
    const scenes = ["clear", "obstacle", "stairs", "blocked"] as const;

    for (let i = 0; i < N; i++) {
      const scene = scenes[i % scenes.length]!;
      provider.setScene(scene);
      const now = 1_000_000 + i * 5_000;

      timings.push(
        await measure(async () => {
          const analysis = await provider.analyzeFrame({
            frame: { ...FRAME, capturedAt: now - 200 },
          });
          const { assessment, fusionOverride } = engine.assess({
            sceneAnalysis: analysis,
            location: null,
            heading: null,
            route: null,
            currentRouteStep: null,
            now,
          });
          dispatch.onSafetyUpdate(assessment, fusionOverride, now);
        }),
      );
    }

    timings.sort((a, b) => a - b);
    const mean = timings.reduce((a, b) => a + b, 0) / timings.length;
    const p95 = percentile(timings, 95);
    console.log(
      `  combined-pipeline mean=${mean.toFixed(2)}ms p95=${p95.toFixed(2)}ms (n=${N})`,
    );
    expect(p95).toBeLessThan(30);
  });
});
