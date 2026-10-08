import { describe, expect, it, vi } from "vitest";
import type { SceneQueryClient, SceneQueryResponse } from "@/perception";
import { SceneQueryHandler } from "./scene-query-handler";

function createMockSpeechEngine() {
  return {
    speak: vi.fn(),
  };
}

function createMockQueryClient(
  response?: SceneQueryResponse,
): SceneQueryClient {
  return {
    query: vi.fn().mockResolvedValue(
      response ?? {
        ok: true,
        answer: "A wall is ahead.",
        queriedAt: Date.now(),
        latencyMs: 100,
      },
    ),
  };
}

function createMockCaptureFrame() {
  return vi.fn().mockResolvedValue({
    blob: new Blob(["fake"], { type: "image/jpeg" }),
    capturedAt: Date.now(),
    width: 640,
    height: 480,
  });
}

describe("SceneQueryHandler", () => {
  it("starts in idle state", () => {
    const handler = new SceneQueryHandler({
      queryClient: createMockQueryClient(),
      speechEngine: createMockSpeechEngine() as never,
      captureFrame: createMockCaptureFrame(),
    });
    expect(handler.state).toBe("idle");
    expect(handler.lastAnswer).toBeNull();
    expect(handler.lastError).toBeNull();
  });

  it("getSnapshot returns current state", () => {
    const handler = new SceneQueryHandler({
      queryClient: createMockQueryClient(),
      speechEngine: createMockSpeechEngine() as never,
      captureFrame: createMockCaptureFrame(),
    });
    const snap = handler.getSnapshot();
    expect(snap.state).toBe("idle");
    expect(snap.lastAnswer).toBeNull();
    expect(snap.lastError).toBeNull();
  });

  it("submits question and returns answer", async () => {
    const speechEngine = createMockSpeechEngine();
    const queryClient = createMockQueryClient();
    const handler = new SceneQueryHandler({
      queryClient,
      speechEngine: speechEngine as never,
      captureFrame: createMockCaptureFrame(),
    });

    await handler.submitQuestion("What is ahead?");

    expect(queryClient.query).toHaveBeenCalledTimes(1);
    expect(speechEngine.speak).toHaveBeenCalledWith(
      "A wall is ahead.",
      "information",
    );
    expect(handler.lastAnswer).toBe("A wall is ahead.");
    expect(handler.state).toBe("idle");
  });

  it("sets error state on query failure", async () => {
    const queryClient = createMockQueryClient({
      ok: false,
      error: {
        code: "ai_error",
        message: "Model unavailable",
        retryable: true,
      },
    });
    const handler = new SceneQueryHandler({
      queryClient,
      speechEngine: createMockSpeechEngine() as never,
      captureFrame: createMockCaptureFrame(),
    });

    await handler.submitQuestion("What is ahead?");

    expect(handler.state).toBe("error");
    expect(handler.lastError).toBe("Model unavailable");
  });

  it("sets error state on frame capture failure", async () => {
    const handler = new SceneQueryHandler({
      queryClient: createMockQueryClient(),
      speechEngine: createMockSpeechEngine() as never,
      captureFrame: vi.fn().mockRejectedValue(new Error("No camera")),
    });

    await handler.submitQuestion("What is ahead?");

    expect(handler.state).toBe("error");
    expect(handler.lastError).toContain("camera frame");
  });

  it("notifies listeners on state changes", async () => {
    const listener = vi.fn();
    const handler = new SceneQueryHandler({
      queryClient: createMockQueryClient(),
      speechEngine: createMockSpeechEngine() as never,
      captureFrame: createMockCaptureFrame(),
    });
    handler.subscribe(listener);

    await handler.submitQuestion("Hello?");
    expect(listener).toHaveBeenCalled();
  });

  it("cancel aborts in-flight query", () => {
    const handler = new SceneQueryHandler({
      queryClient: createMockQueryClient(),
      speechEngine: createMockSpeechEngine() as never,
      captureFrame: createMockCaptureFrame(),
    });

    void handler.submitQuestion("Hello?");
    handler.cancel();

    expect(handler.state).toBe("idle");
  });

  it("dispose clears listeners", async () => {
    const listener = vi.fn();
    const handler = new SceneQueryHandler({
      queryClient: createMockQueryClient(),
      speechEngine: createMockSpeechEngine() as never,
      captureFrame: createMockCaptureFrame(),
    });
    handler.subscribe(listener);
    handler.dispose();
    listener.mockClear();

    await handler.submitQuestion("Hello?");
    expect(listener).not.toHaveBeenCalled();
  });
});
