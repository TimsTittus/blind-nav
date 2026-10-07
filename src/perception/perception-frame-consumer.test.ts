import { describe, expect, it, vi } from "vitest";
import type { CapturedFrame } from "@/camera";
import { createPerceptionFrameConsumer } from "./perception-frame-consumer";
import type { PerceptionController } from "./perception-controller";

function fakeController() {
  const submit = vi.fn();
  return { controller: { submit } as unknown as PerceptionController, submit };
}

function capturedFrame(): CapturedFrame {
  return {
    blob: new Blob(["pixels"], { type: "image/jpeg" }),
    width: 640,
    height: 480,
    mimeType: "image/jpeg",
    capturedAt: 1_700_000_000_000,
    sequence: 1,
  };
}

describe("createPerceptionFrameConsumer", () => {
  it("encodes the frame and submits it to the controller", async () => {
    const { controller, submit } = fakeController();
    const encode = vi.fn().mockResolvedValue("data:image/jpeg;base64,AAAA");
    const consumer = createPerceptionFrameConsumer({ controller, encode });

    await consumer.consume(capturedFrame());

    expect(encode).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledWith({
      dataUrl: "data:image/jpeg;base64,AAAA",
      capturedAt: 1_700_000_000_000,
      width: 640,
      height: 480,
    });
  });

  it("does not submit (or throw) when encoding fails", async () => {
    const { controller, submit } = fakeController();
    const onError = vi.fn();
    const consumer = createPerceptionFrameConsumer({
      controller,
      encode: vi.fn().mockRejectedValue(new Error("encode failed")),
      onError,
    });

    await consumer.consume(capturedFrame());

    expect(submit).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });
});
