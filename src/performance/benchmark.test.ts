/**
 * Performance benchmark exercising the pipeline with fixture data.
 * Runs as a normal Vitest test; each test measures and reports timing.
 *
 * This is a development-only test — no external AI calls, no camera hardware.
 */
import { describe, expect, it } from "vitest";
import { FixtureVisionProvider } from "@/providers/fixture/fixture-provider";
import {
  FIXTURE_SCENE_IDS,
  type FixtureSceneId,
} from "@/providers/fixture/fixtures";
import { SafetyEngine } from "@/safety";
import { PerformanceMonitor } from "./performance-monitor";

const ITERATIONS = 50;

interface BenchmarkResult {
  label: string;
  iterations: number;
  meanMs: number;
  minMs: number;
  maxMs: number;
  p95Ms: number;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

function benchmark(
  label: string,
  fn: () => void | Promise<void>,
): Promise<BenchmarkResult> {
  return runBenchmark(label, ITERATIONS, fn);
}

async function runBenchmark(
  label: string,
  iterations: number,
  fn: () => void | Promise<void>,
): Promise<BenchmarkResult> {
  const timings: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    timings.push(performance.now() - start);
  }

  timings.sort((a, b) => a - b);
  const mean = timings.reduce((a, b) => a + b, 0) / timings.length;

  return {
    label,
    iterations,
    meanMs: Math.round(mean * 100) / 100,
    minMs: Math.round(timings[0]! * 100) / 100,
    maxMs: Math.round(timings[timings.length - 1]! * 100) / 100,
    p95Ms: Math.round(percentile(timings, 95) * 100) / 100,
  };
}

function formatResult(r: BenchmarkResult): string {
  return `${r.label}: mean=${r.meanMs}ms min=${r.minMs}ms max=${r.maxMs}ms p95=${r.p95Ms}ms (n=${r.iterations})`;
}

describe("Performance Benchmark", () => {
  const results: BenchmarkResult[] = [];

  it("fixture provider: analyze frame across all scenes", async () => {
    const provider = new FixtureVisionProvider({ delayMs: 0 });

    for (const sceneId of FIXTURE_SCENE_IDS) {
      provider.setScene(sceneId);
      const r = await benchmark(`fixture-analyze:${sceneId}`, async () => {
        await provider.analyzeFrame({
          frame: {
            dataUrl: "data:image/jpeg;base64,/9j/4AAQ",
            capturedAt: Date.now(),
          },
        });
      });
      results.push(r);
      expect(r.meanMs).toBeLessThan(50);
    }
  });

  it("safety engine: assess all fixture scenes", async () => {
    const provider = new FixtureVisionProvider({ delayMs: 0 });
    const safetyEngine = new SafetyEngine();

    for (const sceneId of FIXTURE_SCENE_IDS) {
      provider.setScene(sceneId);
      const analysis = await provider.analyzeFrame({
        frame: {
          dataUrl: "data:image/jpeg;base64,/9j/4AAQ",
          capturedAt: Date.now(),
        },
      });

      const r = await benchmark(`safety-assess:${sceneId}`, () => {
        safetyEngine.assess({
          sceneAnalysis: analysis,
          location: null,
          heading: null,
          route: null,
          currentRouteStep: null,
          now: Date.now(),
        });
      });
      results.push(r);
      expect(r.meanMs).toBeLessThan(5);
    }
  });

  it("full pipeline: fixture analyze → safety → dispatch timing", async () => {
    const provider = new FixtureVisionProvider({ delayMs: 0 });
    const safetyEngine = new SafetyEngine();

    const scenes: FixtureSceneId[] = [
      "clear",
      "obstacle",
      "stairs",
      "blocked",
      "puddle",
      "uncertain",
    ];

    const r = await benchmark("pipeline:analyze→safety", async () => {
      const scene = scenes[Math.floor(Math.random() * scenes.length)]!;
      provider.setScene(scene);

      const analysis = await provider.analyzeFrame({
        frame: {
          dataUrl: "data:image/jpeg;base64,/9j/4AAQ",
          capturedAt: Date.now(),
        },
      });

      safetyEngine.assess({
        sceneAnalysis: analysis,
        location: null,
        heading: null,
        route: null,
        currentRouteStep: null,
        now: Date.now(),
      });
    });
    results.push(r);
    expect(r.meanMs).toBeLessThan(50);
  });

  it("PerformanceMonitor: getMetrics under load", async () => {
    const monitor = new PerformanceMonitor();

    for (let i = 0; i < 200; i++) {
      monitor.recordFrameCapture(10);
      monitor.recordAiRequestEnd(Date.now() - 300);
      if (i % 10 === 0) monitor.recordAiFailure();
      monitor.recordGpsUpdate(10 + Math.random() * 5);
      monitor.recordSpeechQueueLength(Math.floor(Math.random() * 3));
      monitor.recordSpeechDispatched();
    }

    const r = await benchmark("monitor:getMetrics", () => {
      monitor.getMetrics();
    });
    results.push(r);
    monitor.dispose();
    expect(r.meanMs).toBeLessThan(5);
  });

  it("prints benchmark report", () => {
    const lines = [
      "",
      "═══════════════════════════════════════════════════",
      "  PERFORMANCE BENCHMARK REPORT",
      "═══════════════════════════════════════════════════",
      "",
      ...results.map((r) => `  ${formatResult(r)}`),
      "",
      "═══════════════════════════════════════════════════",
      "",
    ];
    console.log(lines.join("\n"));
    expect(results.length).toBeGreaterThan(0);
  });
});
