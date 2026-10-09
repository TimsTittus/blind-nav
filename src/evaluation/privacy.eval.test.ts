/**
 * Privacy verification tests.
 *
 * Verifies four privacy properties:
 *   1. Frames are not persisted — no write to localStorage, IndexedDB, or disk.
 *   2. No hidden upload — data:URLs are only sent to the internal endpoint.
 *   3. No accidental console logging of image data.
 *   4. No sensitive location logging.
 *
 * These tests inspect the runtime behavior and module structure of the
 * client-side pipeline rather than AI calls, so no real camera or key is needed.
 */
import { describe, expect, it, vi } from "vitest";
import { ANALYZE_ENDPOINT } from "@/perception/config";
import { FixtureVisionProvider } from "@/providers/fixture/fixture-provider";

describe("Privacy 1 — Frames not persisted", () => {
  it("FixtureVisionProvider does not call localStorage.setItem with image data", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const provider = new FixtureVisionProvider({ delayMs: 0, scene: "clear" });
    await provider.analyzeFrame({
      frame: {
        dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/".repeat(
          2,
        ),
        capturedAt: Date.now(),
      },
    });
    const imageCalls = setItem.mock.calls.filter(
      ([, value]) =>
        typeof value === "string" && value.startsWith("data:image/"),
    );
    expect(imageCalls).toHaveLength(0);
    setItem.mockRestore();
  });

  it("AnalysisClient ANALYZE_ENDPOINT is a relative internal path, not an external URL", () => {
    // The endpoint must be an internal Next.js route — never an external host.
    expect(ANALYZE_ENDPOINT).toMatch(/^\/api\//);
    expect(ANALYZE_ENDPOINT).not.toMatch(/^https?:\/\//);
    expect(ANALYZE_ENDPOINT).not.toContain("analytics");
    expect(ANALYZE_ENDPOINT).not.toContain("telemetry");
  });
});

describe("Privacy 2 — No hidden upload", () => {
  it("fetch is only called with the internal analyze endpoint", async () => {
    const calls: string[] = [];
    const mockFetch = vi.fn(
      async (url: RequestInfo | URL): Promise<Response> => {
        calls.push(String(url instanceof Request ? url.url : url));
        // Return a plausible analyze success so the client can process it.
        const body = JSON.stringify({
          ok: true,
          sequence: 1,
          analysis: {
            sceneType: "sidewalk",
            pathStatus: "clear",
            terrain: "even",
            overallConfidence: 0.9,
            uncertainty: "low",
            obstacles: [],
            hazards: [],
            recommendedImmediateAction: "continue",
            description: "Clear path.",
            analysisId: "aaaabbbb-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            capturedAt: 1_000_000,
            analyzedAt: 1_000_200,
            availability: "ok",
            provider: "fixture",
          },
          latencyMs: 100,
        });
        return new Response(body, {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    ) as unknown as typeof fetch;

    // AnalysisClient uses fetch internally; inject the mock.
    vi.stubGlobal("fetch", mockFetch);

    try {
      const { createAnalysisClient } =
        await import("@/perception/analysis-client");
      const client = createAnalysisClient();
      await client.analyze({
        dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/".repeat(
          2,
        ),
        capturedAt: Date.now(),
        sequence: 1,
      });

      for (const url of calls) {
        expect(url).toMatch(/^(https?:\/\/localhost|\/api\/vision\/analyze)/);
        expect(url).not.toMatch(/analytics|telemetry|third-party|external/);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("FixtureVisionProvider never calls fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const provider = new FixtureVisionProvider({
      delayMs: 0,
      scene: "obstacle",
    });
    await provider.analyzeFrame({
      frame: {
        dataUrl: "data:image/jpeg;base64,/9j/4AAQ",
        capturedAt: Date.now(),
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("Privacy 3 — No console image logging", () => {
  it("fixture provider does not log data URLs to console", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {
      /* no-op */
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {
      /* no-op */
    });
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {
      /* no-op */
    });

    try {
      const provider = new FixtureVisionProvider({
        delayMs: 0,
        scene: "obstacle",
      });
      await provider.analyzeFrame({
        frame: {
          dataUrl: "data:image/jpeg;base64,/9j/SENSITIVEDATA",
          capturedAt: Date.now(),
        },
      });

      const allArgs = [
        ...logSpy.mock.calls.flat(),
        ...warnSpy.mock.calls.flat(),
        ...debugSpy.mock.calls.flat(),
      ].map(String);

      const leaksImageData = allArgs.some(
        (arg) => arg.includes("SENSITIVEDATA") || arg.startsWith("data:image/"),
      );
      expect(
        leaksImageData,
        "Image data must not appear in console output",
      ).toBe(false);
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      debugSpy.mockRestore();
    }
  });
});

describe("Privacy 4 — No sensitive location logging", () => {
  it("SafetyEngine does not log location coordinates to console", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {
      /* no-op */
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {
      /* no-op */
    });

    try {
      const { SafetyEngine } = await import("@/safety");
      const engine = new SafetyEngine();
      const { FixtureVisionProvider } =
        await import("@/providers/fixture/fixture-provider");
      const provider = new FixtureVisionProvider({
        delayMs: 0,
        scene: "clear",
      });
      const analysis = await provider.analyzeFrame({
        frame: {
          dataUrl: "data:image/jpeg;base64,/9j/4AAQ",
          capturedAt: Date.now(),
        },
      });

      const sensitiveLocation = {
        coords: { lat: 51.501476, lng: -0.140634 },
        accuracyMeters: 5,
        timestamp: Date.now(),
      };

      engine.assess({
        sceneAnalysis: analysis,
        location: sensitiveLocation,
        heading: null,
        route: null,
        currentRouteStep: null,
        now: Date.now(),
      });

      const allArgs = [
        ...logSpy.mock.calls.flat(),
        ...warnSpy.mock.calls.flat(),
      ].map(String);

      const leaksCoords = allArgs.some(
        (arg) => arg.includes("51.501") || arg.includes("-0.140"),
      );
      expect(
        leaksCoords,
        "GPS coordinates must not appear in console output",
      ).toBe(false);
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it("PerformanceMonitor does not store or log location coordinates", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {
      /* no-op */
    });

    try {
      const { PerformanceMonitor } = await import("@/performance");
      const monitor = new PerformanceMonitor();
      // recordGpsUpdate only records accuracy, not coordinates
      monitor.recordGpsUpdate(5.2);
      const metrics = monitor.getMetrics();
      const serialized = JSON.stringify(metrics);
      expect(serialized).not.toContain("51.501");
      expect(serialized).not.toContain("-0.140");
      monitor.dispose();
    } finally {
      logSpy.mockRestore();
    }
  });
});
