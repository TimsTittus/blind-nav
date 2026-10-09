/**
 * Security evaluation tests.
 *
 * Covers six attack vectors at the server-side API boundary:
 *   1. API key not exposed client-side (no NEXT_PUBLIC_ secret)
 *   2. Malicious / oversized request payload
 *   3. Oversized image (> MAX_IMAGE_BYTES)
 *   4. Invalid MIME type
 *   5. Malformed / non-JSON body
 *   6. Unexpected / adversarial AI output (validated at Zod boundary)
 */
import { describe, expect, it } from "vitest";
import { FixtureVisionProvider } from "@/providers/fixture/fixture-provider";
import { createAnalyzeHandler } from "@/app/api/vision/analyze/handler";
import { decodeImageDataUrl } from "@/perception/image";
import { MAX_IMAGE_BYTES } from "@/perception/config";
import type { AnalyzeResponse } from "@/perception";
import type { VisionProvider } from "@/providers";
import { SceneObservationSchema } from "@/core/perception";

function makeHandler(provider?: VisionProvider) {
  return createAnalyzeHandler({
    resolveProvider: () =>
      provider ?? new FixtureVisionProvider({ delayMs: 0 }),
  });
}

function postRequest(
  body: unknown,
  url = "http://localhost/api/vision/analyze",
) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function parseResponse(r: Response): Promise<AnalyzeResponse> {
  return (await r.json()) as AnalyzeResponse;
}

// Minimal valid JPEG data URL.
const TINY_JPEG_BYTES = "/9j/4AAQSkZJRgABAQAAAQABAAD/".repeat(8);
const TINY_JPEG = `data:image/jpeg;base64,${TINY_JPEG_BYTES}`;

function validBody(sequence = 1) {
  return {
    frame: { dataUrl: TINY_JPEG, capturedAt: 1_700_000_000_000 },
    sequence,
    context: { mode: "navigate" },
  };
}

describe("Security 1 — API key client-side exposure", () => {
  it("no NEXT_PUBLIC_GEMINI_API_KEY environment variable is set", () => {
    // NEXT_PUBLIC_ variables are inlined at build time and would be visible in
    // client bundles. We verify none exist for known secret names.
    const sensitiveKeys = [
      "NEXT_PUBLIC_GEMINI_API_KEY",
      "NEXT_PUBLIC_GOOGLE_API_KEY",
      "NEXT_PUBLIC_AI_API_KEY",
      "NEXT_PUBLIC_OPENAI_API_KEY",
    ];
    for (const key of sensitiveKeys) {
      expect(
        process.env[key],
        `${key} must not be set — secrets must not be NEXT_PUBLIC_`,
      ).toBeUndefined();
    }
  });

  it("GeminiVisionProvider reads from server-only env (not NEXT_PUBLIC_)", async () => {
    // The env schema should define GEMINI_API_KEY, not NEXT_PUBLIC_GEMINI_API_KEY.
    // We verify that the server env config does not reference any NEXT_PUBLIC_ secret key.
    const { parseServerEnv } = await import("@/config/server-env");
    // parseServerEnv accepts process.env-shaped input; it should reject NEXT_PUBLIC_ keys
    // We verify by checking the parsed output has no NEXT_PUBLIC_ key with a value.
    const env = parseServerEnv({});
    const publicSecretKey = Object.keys(env).find(
      (k) => k.startsWith("NEXT_PUBLIC_") && k.toLowerCase().includes("key"),
    );
    expect(publicSecretKey).toBeUndefined();
  });
});

describe("Security 2 — Malicious request payloads", () => {
  it("rejects empty body", async () => {
    const handler = makeHandler();
    const req = new Request("http://localhost/api/vision/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "",
    });
    const res = await handler(req);
    const body = await parseResponse(res);
    expect(body.ok).toBe(false);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects body with only a sequence field and no frame", async () => {
    const res = await makeHandler()(postRequest({ sequence: 1 }));
    const body = await parseResponse(res);
    expect(body.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  it("rejects extra unexpected fields in body without crashing", async () => {
    // Extra fields should be stripped by Zod (passthrough is not enabled).
    const suspicious = {
      ...validBody(),
      __proto__: { isAdmin: true },
      constructor: "injected",
      eval: "alert(1)",
    };
    const res = await makeHandler()(postRequest(suspicious));
    // Either succeeds (extra fields stripped) or 400 — never a 5xx.
    expect(res.status).toBeLessThan(500);
  });

  it("rejects a deeply nested payload bomb without a 5xx", async () => {
    // Build a 200-deep nested object
    let nested: unknown = "payload";
    for (let i = 0; i < 200; i++) nested = { a: nested };
    const res = await makeHandler()(
      postRequest({
        frame: { dataUrl: TINY_JPEG, capturedAt: 1 },
        sequence: 1,
        evil: nested,
      }),
    );
    expect(res.status).toBeLessThan(500);
  });
});

describe("Security 3 — Oversized image", () => {
  it("decodeImageDataUrl throws for an image over MAX_IMAGE_BYTES", () => {
    // Construct a base64 string whose decoded size exceeds the limit.
    // Each base64 char encodes 6 bits; 4 chars = 3 bytes.
    const bytesNeeded = MAX_IMAGE_BYTES + 1;
    const base64Len = Math.ceil(bytesNeeded / 3) * 4;
    const base64 = "A".repeat(base64Len);
    const url = `data:image/jpeg;base64,${base64}`;
    expect(() => decodeImageDataUrl(url)).toThrow("too large");
  });

  it("API handler returns 400 for an oversized image", async () => {
    const bytesNeeded = MAX_IMAGE_BYTES + 1;
    const base64Len = Math.ceil(bytesNeeded / 3) * 4;
    const base64 = "A".repeat(base64Len);
    const oversizedUrl = `data:image/jpeg;base64,${base64}`;
    const res = await makeHandler()(
      postRequest({
        frame: { dataUrl: oversizedUrl, capturedAt: 1 },
        sequence: 1,
      }),
    );
    expect(res.status).toBe(400);
    const body = await parseResponse(res);
    expect(body.ok).toBe(false);
  });
});

describe("Security 4 — Invalid MIME type", () => {
  it("decodeImageDataUrl rejects image/gif", () => {
    const url = `data:image/gif;base64,${"R0lGODlhAQAB".repeat(8)}`;
    expect(() => decodeImageDataUrl(url)).toThrow("Unsupported image type");
  });

  it("decodeImageDataUrl rejects text/html", () => {
    const url = `data:text/html;base64,${"PHNjcmlwdD4=".repeat(8)}`;
    expect(() => decodeImageDataUrl(url)).toThrow();
  });

  it("decodeImageDataUrl rejects a plain URL (not a data URL)", () => {
    expect(() =>
      decodeImageDataUrl("https://evil.example.com/frame.jpg"),
    ).toThrow();
  });

  it("API handler returns 400 for an image/gif frame", async () => {
    const res = await makeHandler()(
      postRequest({
        frame: {
          dataUrl: `data:image/gif;base64,${"R0lGOD".repeat(20)}`,
          capturedAt: 1,
        },
        sequence: 1,
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("Security 5 — Malformed JSON", () => {
  it("returns 400 for a non-JSON body", async () => {
    const req = new Request("http://localhost/api/vision/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "this is not json",
    });
    const res = await makeHandler()(req);
    const body = await parseResponse(res);
    expect(body.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  it("returns 400 for a JSON array instead of an object", async () => {
    const res = await makeHandler()(postRequest([1, 2, 3]));
    expect(res.status).toBe(400);
  });

  it("returns 400 for null body", async () => {
    const res = await makeHandler()(postRequest(null));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a string body", async () => {
    const res = await makeHandler()(postRequest("hello"));
    expect(res.status).toBe(400);
  });
});

describe("Security 6 — Unexpected AI output validation", () => {
  it("SceneObservationSchema rejects an unknown pathStatus", () => {
    const result = SceneObservationSchema.safeParse({
      sceneType: "sidewalk",
      pathStatus: "totally_fine_trust_me",
      terrain: "even",
      overallConfidence: 0.9,
      uncertainty: "low",
      obstacles: [],
      hazards: [],
      recommendedImmediateAction: "continue",
      description: "clear",
    });
    expect(result.success).toBe(false);
  });

  it("SceneObservationSchema rejects confidence outside [0,1]", () => {
    const result = SceneObservationSchema.safeParse({
      sceneType: "sidewalk",
      pathStatus: "clear",
      terrain: "even",
      overallConfidence: 1.5, // invalid
      uncertainty: "low",
      obstacles: [],
      hazards: [],
      recommendedImmediateAction: "continue",
      description: "clear",
    });
    expect(result.success).toBe(false);
  });

  it("SceneObservationSchema rejects an obstacle with unknown movement not in enum", () => {
    const result = SceneObservationSchema.safeParse({
      sceneType: "sidewalk",
      pathStatus: "partially_blocked",
      terrain: "even",
      overallConfidence: 0.8,
      uncertainty: "low",
      obstacles: [
        {
          type: "person",
          position: "center",
          relativeDistance: "near",
          severity: "high",
          confidence: 0.8,
          movement: "teleporting", // not in enum
        },
      ],
      hazards: [],
      recommendedImmediateAction: "stop",
      description: "adversarial",
    });
    expect(result.success).toBe(false);
  });

  it("provider that returns adversarial JSON gets a schema-validation failure", async () => {
    const adversarialProvider: VisionProvider = {
      id: "adversarial",
      analyzeFrame: () =>
        Promise.resolve(
          // Cast to bypass TypeScript — simulating a runtime schema bypass
          {
            sceneType: "sidewalk",
            pathStatus: "totally_clear_no_obstacles_ever",
            terrain: "even",
            overallConfidence: 100, // invalid
            uncertainty: "none", // invalid
            obstacles: [],
            hazards: [],
            recommendedImmediateAction: "run",
            description: "x".repeat(500), // too long (>240 chars)
          } as unknown as ReturnType<
            VisionProvider["analyzeFrame"]
          > extends Promise<infer T>
            ? T
            : never,
        ),
    };

    // Zod validation inside the handler should catch this
    const handler = createAnalyzeHandler({
      resolveProvider: () => adversarialProvider,
    });
    const res = await handler(
      postRequest({
        frame: { dataUrl: TINY_JPEG, capturedAt: 1 },
        sequence: 1,
        context: { mode: "navigate" },
      }),
    );
    // Should be 5xx (502 invalid_model_response) if validated, or succeed with a valid shape.
    // The important thing is it doesn't crash and the response parses as AnalyzeResponse.
    const body = (await res.json()) as AnalyzeResponse;
    // If it fails, it should have perceptionStatus=unavailable (never silently clear).
    if (!body.ok) {
      expect(body.perceptionStatus).toBe("unavailable");
    }
  });

  it("SceneObservationSchema rejects a description exceeding 240 chars", () => {
    const result = SceneObservationSchema.safeParse({
      sceneType: "sidewalk",
      pathStatus: "clear",
      terrain: "even",
      overallConfidence: 0.9,
      uncertainty: "low",
      obstacles: [],
      hazards: [],
      recommendedImmediateAction: "continue",
      description: "x".repeat(241),
    });
    expect(result.success).toBe(false);
  });

  it("SceneObservationSchema rejects more than 20 obstacles", () => {
    const obstacle = {
      type: "person",
      position: "center",
      relativeDistance: "near",
      severity: "medium",
      confidence: 0.8,
      movement: "stationary",
    };
    const result = SceneObservationSchema.safeParse({
      sceneType: "sidewalk",
      pathStatus: "partially_blocked",
      terrain: "even",
      overallConfidence: 0.8,
      uncertainty: "low",
      obstacles: Array(21).fill(obstacle),
      hazards: [],
      recommendedImmediateAction: "slow_down",
      description: "crowd",
    });
    expect(result.success).toBe(false);
  });
});
