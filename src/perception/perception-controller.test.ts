import { describe, expect, it, vi } from "vitest";
import type { SceneAnalysis } from "@/core";
import type { AnalysisClient, AnalyzeClientRequest } from "./analysis-client";
import type { AnalyzeResponse } from "./analyze-contract";
import { PerceptionController } from "./perception-controller";

function scene(pathStatus: SceneAnalysis["pathStatus"]): SceneAnalysis {
  return {
    analysisId: "11111111-1111-4111-8111-111111111111",
    capturedAt: 1,
    analyzedAt: 2,
    availability: "ok",
    provider: "fixture",
    sceneType: "sidewalk",
    pathStatus,
    terrain: "even",
    overallConfidence: 0.8,
    uncertainty: "low",
    obstacles: [],
    hazards: [],
    recommendedImmediateAction: "continue",
    description: "x",
  };
}

/** A client whose responses are resolved manually, one per call. */
function deferredClient() {
  const calls: {
    request: AnalyzeClientRequest;
    resolve: (r: AnalyzeResponse) => void;
    reject: (e: unknown) => void;
    aborted: () => boolean;
  }[] = [];
  const client: AnalysisClient = {
    analyze(request) {
      return new Promise<AnalyzeResponse>((resolve, reject) => {
        calls.push({
          request,
          resolve,
          reject,
          aborted: () => request.signal?.aborted ?? false,
        });
      });
    },
  };
  return { client, calls };
}

const frame = (capturedAt: number) => ({
  dataUrl: "data:image/jpeg;base64,AAAA",
  capturedAt,
});

describe("PerceptionController", () => {
  it("runs one request at a time and applies a success", async () => {
    const { client, calls } = deferredClient();
    const controller = new PerceptionController({ client });

    controller.submit(frame(1));
    expect(calls).toHaveLength(1);
    expect(controller.getSnapshot().inFlight).toBe(true);

    calls[0]!.resolve({
      ok: true,
      sequence: calls[0]!.request.sequence,
      analysis: scene("clear"),
      latencyMs: 42,
    });
    await flush();

    const state = controller.getSnapshot();
    expect(state.status).toBe("ok");
    expect(state.analysis?.pathStatus).toBe("clear");
    expect(state.inFlight).toBe(false);
  });

  it("coalesces frames submitted while busy to only the newest", async () => {
    const { client, calls } = deferredClient();
    const controller = new PerceptionController({ client });

    controller.submit(frame(1)); // starts (call 0)
    controller.submit(frame(2)); // pending
    controller.submit(frame(3)); // replaces pending (frame 2 dropped)
    expect(calls).toHaveLength(1);

    calls[0]!.resolve({
      ok: true,
      sequence: calls[0]!.request.sequence,
      analysis: scene("clear"),
      latencyMs: 1,
    });
    await flush();

    // The pending newest frame runs next; the middle one never did.
    expect(calls).toHaveLength(2);
    expect(calls[1]!.request.capturedAt).toBe(3);
  });

  it("marks perception unavailable on an ok:false response", async () => {
    const { client, calls } = deferredClient();
    const controller = new PerceptionController({ client });
    controller.submit(frame(1));
    calls[0]!.resolve({
      ok: false,
      sequence: calls[0]!.request.sequence,
      error: { code: "timeout", message: "slow", retryable: true },
      perceptionStatus: "unavailable",
    });
    await flush();
    const state = controller.getSnapshot();
    expect(state.status).toBe("unavailable");
    expect(state.analysis).toBeNull();
    expect(state.lastError?.code).toBe("timeout");
  });

  it("marks perception unavailable on a thrown error", async () => {
    const { client, calls } = deferredClient();
    const controller = new PerceptionController({ client });
    controller.submit(frame(1));
    calls[0]!.reject(new Error("boom"));
    await flush();
    expect(controller.getSnapshot().status).toBe("unavailable");
  });

  it("aborts the in-flight request and ignores its result on dispose", async () => {
    const { client, calls } = deferredClient();
    const controller = new PerceptionController({ client });
    controller.submit(frame(1));
    controller.dispose();
    expect(calls[0]!.aborted()).toBe(true);

    // A late resolution after dispose must not change state.
    calls[0]!.resolve({
      ok: true,
      sequence: calls[0]!.request.sequence,
      analysis: scene("blocked"),
      latencyMs: 1,
    });
    await flush();
    expect(controller.getSnapshot().status).toBe("unavailable");
    expect(controller.getSnapshot().analysis).toBeNull();
  });

  it("stops accepting submissions after dispose", () => {
    const { client, calls } = deferredClient();
    const controller = new PerceptionController({ client });
    controller.dispose();
    controller.submit(frame(1));
    expect(calls).toHaveLength(0);
  });

  it("notifies subscribers on state changes", async () => {
    const { client, calls } = deferredClient();
    const controller = new PerceptionController({ client });
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    controller.submit(frame(1)); // inFlight -> notify
    calls[0]!.resolve({
      ok: true,
      sequence: calls[0]!.request.sequence,
      analysis: scene("clear"),
      latencyMs: 1,
    });
    await flush();
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});

/** Let microtasks (awaited promise continuations) run. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
