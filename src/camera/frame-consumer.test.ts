import { describe, expect, it, vi } from "vitest";
import { createDevLoggingConsumer } from "./frame-consumer";
import type { CapturedFrame } from "./frame-capture";

const frame: CapturedFrame = {
  blob: new Blob(["12345"], { type: "image/jpeg" }),
  width: 640,
  height: 360,
  mimeType: "image/jpeg",
  capturedAt: 42,
  sequence: 7,
};

describe("createDevLoggingConsumer", () => {
  it("logs metadata only — never the blob", () => {
    const log = vi.fn();
    createDevLoggingConsumer(log, true).consume(frame);
    expect(log).toHaveBeenCalledWith("[camera] frame", {
      sequence: 7,
      width: 640,
      height: 360,
      bytes: 5,
      mimeType: "image/jpeg",
      capturedAt: 42,
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("blob");
  });

  it("is silent when disabled (production)", () => {
    const log = vi.fn();
    createDevLoggingConsumer(log, false).consume(frame);
    expect(log).not.toHaveBeenCalled();
  });
});
