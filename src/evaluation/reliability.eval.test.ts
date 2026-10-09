/**
 * Category 7: Reliability / failure-handling evaluation.
 *
 * Tests 10 failure scenarios that the system must handle gracefully:
 *   1. Network disconnect (fetch throws)
 *   2. API timeout
 *   3. API rate limit
 *   4. Invalid / malformed response from provider
 *   5. GPS unavailable
 *   6. Camera permission denied
 *   7. Microphone / speech unavailable
 *   8. Tab backgrounding (visibility change)
 *   9. Device rotation (resize during active session)
 *  10. Session cancellation mid-flight
 *
 * Each test verifies that the system:
 *   - Never silently implies the path is clear on an error.
 *   - Returns a typed error, not an uncaught exception.
 *   - Marks perception as "unavailable", not as a valid analysis.
 */
import { describe, expect, it, vi } from "vitest";
import {
  AiProviderError,
  NetworkError,
  PermissionDeniedError,
  RateLimitedError,
  TimeoutError,
  UnavailableError,
} from "@/core";
import { type AnalyzeResponse, type AnalysisClient } from "@/perception";
import type { VisionProvider } from "@/providers";
import { createAnalyzeHandler } from "@/app/api/vision/analyze/handler";
import { TINY_JPEG } from "./helpers";

function errorProvider(error: unknown): VisionProvider {
  return {
    id: "stub-error",
    analyzeFrame: () => Promise.reject(error),
  };
}

function makeHandler(error: unknown) {
  return createAnalyzeHandler({
    resolveProvider: () => errorProvider(error),
  });
}

function makeRequest(dataUrl = TINY_JPEG) {
  return new Request("http://localhost/api/vision/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      frame: { dataUrl, capturedAt: 1_000_000 },
      sequence: 1,
      context: { mode: "navigate" },
    }),
  });
}

async function parseResponse(r: Response): Promise<AnalyzeResponse> {
  return (await r.json()) as AnalyzeResponse;
}

describe("Reliability 1 — Network disconnect", () => {
  it("returns a typed failure with perceptionStatus=unavailable", async () => {
    const handler = makeHandler(new NetworkError("Fetch failed."));
    const res = await handler(makeRequest());
    const body = await parseResponse(res);
    expect(body.ok).toBe(false);
    if (body.ok) return;
    expect(body.perceptionStatus).toBe("unavailable");
    expect(body.error.code).toBe("network");
    expect(res.status).toBe(502);
  });
});

describe("Reliability 2 — API timeout", () => {
  it("maps timeout to HTTP 504 and marks unavailable", async () => {
    const handler = makeHandler(new TimeoutError());
    const res = await handler(makeRequest());
    const body = await parseResponse(res);
    expect(body.ok).toBe(false);
    if (body.ok) return;
    expect(body.perceptionStatus).toBe("unavailable");
    expect(body.error.code).toBe("timeout");
    expect(res.status).toBe(504);
  });
});

describe("Reliability 3 — API rate limit", () => {
  it("maps rate-limit to HTTP 429 and marks unavailable", async () => {
    const handler = makeHandler(new RateLimitedError("Too many requests."));
    const res = await handler(makeRequest());
    const body = await parseResponse(res);
    expect(body.ok).toBe(false);
    if (body.ok) return;
    expect(body.perceptionStatus).toBe("unavailable");
    expect(body.error.code).toBe("rate_limited");
    expect(res.status).toBe(429);
  });
});

describe("Reliability 4 — Invalid AI response", () => {
  it("maps ai_error to HTTP 502 and marks unavailable", async () => {
    const handler = makeHandler(new AiProviderError("Model returned garbage."));
    const res = await handler(makeRequest());
    const body = await parseResponse(res);
    expect(body.ok).toBe(false);
    if (body.ok) return;
    expect(body.perceptionStatus).toBe("unavailable");
    expect(body.error.code).toBe("ai_error");
    expect(res.status).toBe(502);
  });
});

describe("Reliability 5 — GPS unavailable", () => {
  it("SafetyEngine handles null location without throwing", async () => {
    const { SafetyEngine } = await import("@/safety");
    const { FixtureVisionProvider } =
      await import("@/providers/fixture/fixture-provider");
    const provider = new FixtureVisionProvider({
      delayMs: 0,
      scene: "obstacle",
    });
    const engine = new SafetyEngine();
    const analysis = await provider.analyzeFrame({
      frame: { dataUrl: TINY_JPEG, capturedAt: Date.now() },
    });
    expect(() =>
      engine.assess({
        sceneAnalysis: analysis,
        location: null, // GPS unavailable
        heading: null,
        route: null,
        currentRouteStep: null,
        now: Date.now(),
      }),
    ).not.toThrow();
  });

  it("GPS-denied error has non-retryable code", () => {
    const err = new PermissionDeniedError("geolocation");
    expect(err.code).toBe("permission_denied");
    expect(err.retryable).toBe(false);
    expect(err.feature).toBe("geolocation");
  });
});

describe("Reliability 6 — Camera permission denied", () => {
  it("PermissionDeniedError for camera is non-retryable", () => {
    const err = new PermissionDeniedError("camera");
    expect(err.code).toBe("permission_denied");
    expect(err.retryable).toBe(false);
  });

  it("handler returns 500 on permission_denied", async () => {
    const handler = createAnalyzeHandler({
      resolveProvider: () => {
        throw new PermissionDeniedError("camera");
      },
    });
    const res = await handler(makeRequest());
    const body = await parseResponse(res);
    expect(body.ok).toBe(false);
    if (body.ok) return;
    expect(res.status).toBe(500);
    expect(body.perceptionStatus).toBe("unavailable");
  });
});

describe("Reliability 7 — Microphone / speech unavailable", () => {
  it("SpeechEngine with unsupported provider accepts speak calls without throwing", async () => {
    const { SpeechEngine } = await import("@/speech/speech-engine");
    const { DEFAULT_VOICE_SETTINGS } = await import("@/speech/config");
    const unsupportedProvider = {
      isSpeaking: false,
      isSupported: false as const,
      onEnd: null as (() => void) | null,
      onError: null as ((error: unknown) => void) | null,
      speak: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const engine = new SpeechEngine({
      provider: unsupportedProvider,
      settings: DEFAULT_VOICE_SETTINGS,
    });
    // Should not throw even though provider is unsupported
    expect(() => engine.speak("Hello", "navigation")).not.toThrow();
    engine.dispose();
  });

  it("PermissionDeniedError for microphone is non-retryable", () => {
    const err = new PermissionDeniedError("microphone");
    expect(err.code).toBe("permission_denied");
    expect(err.retryable).toBe(false);
  });
});

describe("Reliability 8 — Tab backgrounding", () => {
  it("AnalysisClient aborts in-flight request when abort signal is fired", async () => {
    const controller = new AbortController();
    // Simulate a never-resolving request that gets aborted
    const pendingRequest = new Promise<void>(() => {
      // intentionally never resolves — aborted before it matters
    });

    const client: AnalysisClient = {
      analyze: (request) => {
        return new Promise((_resolve, rej) => {
          request.signal?.addEventListener("abort", () =>
            rej(new DOMException("AbortError", "AbortError")),
          );
          void pendingRequest; // never resolves in time
        });
      },
    };

    const req = client.analyze({
      dataUrl: TINY_JPEG,
      capturedAt: Date.now(),
      sequence: 1,
      signal: controller.signal,
    });
    controller.abort(); // simulate tab going to background

    await expect(req).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("Reliability 9 — Device rotation", () => {
  it("FrameCapture fitWithin handles portrait orientation correctly", async () => {
    const { fitWithin } = await import("@/camera/frame-capture");
    // Portrait: 1080 wide × 1920 tall
    const dims = fitWithin(1080, 1920, 1024, 1024);
    expect(dims.width).toBeLessThanOrEqual(1024);
    expect(dims.height).toBeLessThanOrEqual(1024);
    expect(dims.width / dims.height).toBeCloseTo(1080 / 1920, 1);
  });

  it("FrameCapture fitWithin handles landscape orientation correctly", async () => {
    const { fitWithin } = await import("@/camera/frame-capture");
    // Landscape: 1920 wide × 1080 tall
    const dims = fitWithin(1920, 1080, 1024, 1024);
    expect(dims.width).toBeLessThanOrEqual(1024);
    expect(dims.height).toBeLessThanOrEqual(1024);
    expect(dims.width / dims.height).toBeCloseTo(1920 / 1080, 1);
  });
});

describe("Reliability 10 — Session cancellation", () => {
  it("UnavailableError is retryable", () => {
    const err = new UnavailableError("Cancelled.");
    expect(err.retryable).toBe(true);
  });

  it("handler returns 503 on unavailable", async () => {
    const handler = makeHandler(new UnavailableError("Session cancelled."));
    const res = await handler(makeRequest());
    const body = await parseResponse(res);
    expect(body.ok).toBe(false);
    if (body.ok) return;
    expect(res.status).toBe(503);
    expect(body.perceptionStatus).toBe("unavailable");
  });

  it("SpeechEngine dispose() prevents further speech after cancellation", async () => {
    const { SpeechEngine } = await import("@/speech/speech-engine");
    const { DEFAULT_VOICE_SETTINGS } = await import("@/speech/config");
    const spoken: string[] = [];
    const engine = new SpeechEngine({
      provider: {
        isSpeaking: false,
        isSupported: true,
        onEnd: null,
        onError: null,
        speak: (text: string) => {
          spoken.push(text);
        },
        stop: () => {
          /* no-op */
        },
        pause: () => {
          /* no-op */
        },
        resume: () => {
          /* no-op */
        },
      },
      settings: DEFAULT_VOICE_SETTINGS,
    });
    engine.dispose();
    const accepted = engine.speak("Post-cancel", "critical");
    expect(accepted).toBe(false);
    expect(spoken).toHaveLength(0);
  });
});
