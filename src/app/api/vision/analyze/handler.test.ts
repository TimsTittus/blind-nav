import { describe, expect, it, vi } from "vitest";
import type { SceneAnalysis } from "@/core";
import { FixtureVisionProvider } from "@/providers";
import type { AnalyzeFrameInput, VisionProvider } from "@/providers";
import { AiProviderError, RateLimitedError, TimeoutError } from "@/providers";
import { MAX_IMAGE_BYTES, type AnalyzeResponse } from "@/perception";
import { createAnalyzeHandler } from "./handler";

// A tiny valid base64 JPEG payload (well above MIN_IMAGE_BYTES once repeated).
const JPEG_BYTES = "/9j/4AAQSkZJRgABAQAAAQABAAD/".repeat(8);
const DATA_URL = `data:image/jpeg;base64,${JPEG_BYTES}`;

function makeRequest(
  body: unknown,
  url = "http://localhost/api/vision/analyze",
) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function validBody(sequence = 1) {
  return {
    frame: { dataUrl: DATA_URL, capturedAt: 1_700_000_000_000 },
    sequence,
    context: { mode: "navigate" },
  };
}

/** Handler backed by the canned fixture provider. */
function fixtureHandler(scene?: "clear" | "blocked") {
  return createAnalyzeHandler({
    resolveProvider: () => {
      const provider = new FixtureVisionProvider();
      if (scene) provider.setScene(scene);
      return provider;
    },
    now: () => 1_700_000_000_500,
  });
}

/** Handler backed by a provider that throws a given error. */
function throwingHandler(error: unknown) {
  const provider: VisionProvider = {
    id: "stub",
    analyzeFrame: () => Promise.reject(error),
  };
  return createAnalyzeHandler({ resolveProvider: () => provider });
}

async function parse(response: Response): Promise<AnalyzeResponse> {
  return (await response.json()) as AnalyzeResponse;
}

describe("POST /api/vision/analyze — success", () => {
  it("returns a validated SceneAnalysis for a valid request", async () => {
    const response = await fixtureHandler("clear")(makeRequest(validBody(3)));
    expect(response.status).toBe(200);
    const body = await parse(response);
    expect(body.ok).toBe(true);
    if (!body.ok) return;
    expect(body.sequence).toBe(3);
    expect(body.analysis.pathStatus).toBe("clear");
    expect(body.analysis.provider).toBe("fixture");
    expect(body.analysis.availability).toBe("ok");
    expect(typeof body.latencyMs).toBe("number");
    // No precise distance anywhere in the payload.
    expect(JSON.stringify(body.analysis)).not.toContain("distanceMeters");
  });

  it("never reports a clear path on an uncertain scene", async () => {
    const provider = new FixtureVisionProvider({ scene: "uncertain" });
    const handler = createAnalyzeHandler({ resolveProvider: () => provider });
    const body = await parse(await handler(makeRequest(validBody())));
    expect(body.ok).toBe(true);
    if (!body.ok) return;
    expect(body.analysis.availability).toBe("ambiguous");
    expect(body.analysis.pathStatus).toBe("unknown");
  });
});

describe("POST /api/vision/analyze — request validation", () => {
  it("rejects a non-JSON body as INVALID_IMAGE", async () => {
    const response = await fixtureHandler()(makeRequest("not json{"));
    expect(response.status).toBe(400);
    const body = await parse(response);
    expect(body.ok).toBe(false);
    if (body.ok) return;
    expect(body.error.code).toBe("invalid_image");
    expect(body.perceptionStatus).toBe("unavailable");
  });

  it("rejects a missing frame (malformed request)", async () => {
    const response = await fixtureHandler()(makeRequest({ sequence: 2 }));
    const body = await parse(response);
    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    if (body.ok) return;
    expect(body.error.code).toBe("invalid_image");
    expect(body.sequence).toBe(2); // echoes the sequence even on failure
  });

  it("rejects an unsupported MIME type", async () => {
    const body = {
      frame: {
        dataUrl: `data:image/gif;base64,${JPEG_BYTES}`,
        capturedAt: 1,
      },
      sequence: 1,
    };
    const response = await fixtureHandler()(makeRequest(body));
    expect(response.status).toBe(400);
    const parsed = await parse(response);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe("invalid_image");
  });

  it("rejects a non-data-URL image", async () => {
    const body = {
      frame: { dataUrl: "https://example.com/a.jpg", capturedAt: 1 },
      sequence: 1,
    };
    const response = await fixtureHandler()(makeRequest(body));
    expect(response.status).toBe(400); // FrameInputSchema requires a data: URL
    const parsed = await parse(response);
    expect(parsed.ok).toBe(false);
  });

  it("rejects an oversized image", async () => {
    const huge = "A".repeat(MAX_IMAGE_BYTES * 2);
    const body = {
      frame: { dataUrl: `data:image/jpeg;base64,${huge}`, capturedAt: 1 },
      sequence: 7,
    };
    const response = await fixtureHandler()(makeRequest(body));
    expect(response.status).toBe(400);
    const parsed = await parse(response);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe("invalid_image");
  });
});

describe("POST /api/vision/analyze — provider failures map to typed errors", () => {
  it("maps a rate-limit error to 429 and does not imply a clear path", async () => {
    const response = await throwingHandler(new RateLimitedError())(
      makeRequest(validBody()),
    );
    expect(response.status).toBe(429);
    const body = await parse(response);
    expect(body.ok).toBe(false);
    if (body.ok) return;
    expect(body.error.code).toBe("rate_limited");
    expect(body.perceptionStatus).toBe("unavailable");
  });

  it("maps a timeout to 504", async () => {
    const response = await throwingHandler(new TimeoutError())(
      makeRequest(validBody()),
    );
    expect(response.status).toBe(504);
    const body = await parse(response);
    expect(body.ok).toBe(false);
    if (body.ok) return;
    expect(body.error.code).toBe("timeout");
  });

  it("maps a provider (AI unavailable) error to 502", async () => {
    const response = await throwingHandler(new AiProviderError())(
      makeRequest(validBody()),
    );
    expect(response.status).toBe(502);
    const body = await parse(response);
    expect(body.ok).toBe(false);
    if (body.ok) return;
    expect(body.error.code).toBe("ai_error");
  });

  it("maps an unexpected non-AppError to a safe 503 failure", async () => {
    const response = await throwingHandler(new Error("boom"))(
      makeRequest(validBody()),
    );
    expect(response.status).toBe(503);
    const body = await parse(response);
    expect(body.ok).toBe(false);
    if (body.ok) return;
    expect(body.error.code).toBe("unavailable");
  });
});

describe("POST /api/vision/analyze — fixture selection", () => {
  it("honours the ?scenario= query hint", async () => {
    const provider = new FixtureVisionProvider();
    const spy = vi.spyOn(provider, "analyzeFrame");
    const handler = createAnalyzeHandler({ resolveProvider: () => provider });
    const response = await handler(
      makeRequest(
        validBody(),
        "http://localhost/api/vision/analyze?scenario=blocked",
      ),
    );
    expect(response.status).toBe(200);
    const input = spy.mock.calls[0]?.[0] as AnalyzeFrameInput;
    expect(input.context?.scenario).toBe("blocked");
    const body = await parse(response);
    if (!body.ok) return;
    expect(body.analysis.pathStatus).toBe("blocked");
    // The fixture result flows through unchanged as a SceneAnalysis.
    const analysis: SceneAnalysis = body.analysis;
    expect(Array.isArray(analysis.obstacles)).toBe(true);
  });
});
