import { describe, expect, it, vi } from "vitest";
import type { SceneObservation } from "@/core";
import type { AnalyzeFrameInput } from "../types";
import { type GeminiModels, GeminiVisionProvider } from "./gemini-provider";

const DATA_URL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/";

const INPUT: AnalyzeFrameInput = {
  frame: { dataUrl: DATA_URL, capturedAt: 1_700_000_000_000 },
  context: { mode: "navigate" },
};

const VALID_OBSERVATION: SceneObservation = {
  sceneType: "sidewalk",
  pathStatus: "clear",
  terrain: "even",
  overallConfidence: 0.8,
  uncertainty: "low",
  obstacles: [],
  hazards: [],
  recommendedImmediateAction: "continue",
  description: "Clear sidewalk ahead.",
};

/** A fake `models` whose generateContent returns a fixed text payload. */
function modelsReturning(text: string | undefined): GeminiModels {
  return { generateContent: vi.fn().mockResolvedValue({ text }) };
}

function provider(models: GeminiModels) {
  return new GeminiVisionProvider({ model: "gemini-test", models });
}

describe("GeminiVisionProvider", () => {
  it("validates and normalizes a well-formed model response", async () => {
    const result = await provider(
      modelsReturning(JSON.stringify(VALID_OBSERVATION)),
    ).analyzeFrame(INPUT);

    expect(result.provider).toBe("gemini");
    expect(result.pathStatus).toBe("clear");
    expect(result.availability).toBe("ok");
    expect(result.capturedAt).toBe(INPUT.frame.capturedAt);
    expect(result.analysisId).toMatch(/[0-9a-f-]{36}/);
  });

  it("sends the image as inline base64 data and requests JSON output", async () => {
    const models = modelsReturning(JSON.stringify(VALID_OBSERVATION));
    await provider(models).analyzeFrame(INPUT);
    const call = (models.generateContent as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(call.model).toBe("gemini-test");
    expect(call.config.responseMimeType).toBe("application/json");
    expect(call.config.responseSchema).toBeDefined();
    const parts = call.contents as Array<Record<string, unknown>>;
    const image = parts.find((p) => "inlineData" in p);
    expect(image?.inlineData).toEqual({
      mimeType: "image/jpeg",
      data: "/9j/4AAQSkZJRgABAQAAAQABAAD/",
    });
  });

  it("rejects malformed JSON as INVALID_AI_RESPONSE", async () => {
    await expect(
      provider(modelsReturning("not json {")).analyzeFrame(INPUT),
    ).rejects.toMatchObject({ code: "invalid_model_response" });
  });

  it("rejects an empty model response", async () => {
    await expect(
      provider(modelsReturning("")).analyzeFrame(INPUT),
    ).rejects.toMatchObject({ code: "invalid_model_response" });
  });

  it("rejects a response with a missing required field", async () => {
    const { pathStatus: _omit, ...partial } = VALID_OBSERVATION;
    void _omit;
    await expect(
      provider(modelsReturning(JSON.stringify(partial))).analyzeFrame(INPUT),
    ).rejects.toMatchObject({ code: "invalid_model_response" });
  });

  it("rejects a response with an invalid enum value", async () => {
    const bad = { ...VALID_OBSERVATION, pathStatus: "mostly_clear" };
    await expect(
      provider(modelsReturning(JSON.stringify(bad))).analyzeFrame(INPUT),
    ).rejects.toMatchObject({ code: "invalid_model_response" });
  });

  it("maps a 429 API error to AI_RATE_LIMITED", async () => {
    const err = Object.assign(new Error("quota"), { status: 429 });
    const models: GeminiModels = {
      generateContent: vi.fn().mockRejectedValue(err),
    };
    await expect(provider(models).analyzeFrame(INPUT)).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("maps a 5xx API error to AI_UNAVAILABLE (ai_error)", async () => {
    const err = Object.assign(new Error("server"), { status: 503 });
    const models: GeminiModels = {
      generateContent: vi.fn().mockRejectedValue(err),
    };
    await expect(provider(models).analyzeFrame(INPUT)).rejects.toMatchObject({
      code: "ai_error",
    });
  });

  it("maps an abort/timeout to AI_TIMEOUT", async () => {
    const err = Object.assign(new Error("aborted"), { name: "AbortError" });
    const models: GeminiModels = {
      generateContent: vi.fn().mockRejectedValue(err),
    };
    await expect(provider(models).analyzeFrame(INPUT)).rejects.toMatchObject({
      code: "timeout",
    });
  });

  it("aborts the request when its own timeout elapses", async () => {
    vi.useFakeTimers();
    try {
      const models: GeminiModels = {
        generateContent: (params) =>
          new Promise((_resolve, reject) => {
            const signal = (params.config as { abortSignal?: AbortSignal })
              ?.abortSignal;
            signal?.addEventListener("abort", () =>
              reject(
                Object.assign(new Error("aborted"), { name: "AbortError" }),
              ),
            );
          }),
      };
      const p = new GeminiVisionProvider({
        model: "gemini-test",
        models,
        timeoutMs: 1000,
      }).analyzeFrame(INPUT);
      const expectation = expect(p).rejects.toMatchObject({ code: "timeout" });
      await vi.advanceTimersByTimeAsync(1001);
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });
});
