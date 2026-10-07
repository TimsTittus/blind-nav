import { describe, expect, it } from "vitest";
import { AnalyzeFrameInputSchema, FrameInputSchema } from "./types";

describe("FrameInputSchema", () => {
  it("accepts a data-URL frame", () => {
    expect(
      FrameInputSchema.safeParse({
        dataUrl: "data:image/jpeg;base64,/9j/4AAQ",
        capturedAt: 1700000000000,
      }).success,
    ).toBe(true);
  });

  it("rejects a non-data-URL (e.g. a remote URL)", () => {
    expect(
      FrameInputSchema.safeParse({
        dataUrl: "https://example.com/frame.jpg",
        capturedAt: 1,
      }).success,
    ).toBe(false);
  });

  it("rejects a negative capture timestamp", () => {
    expect(
      FrameInputSchema.safeParse({ dataUrl: "data:,", capturedAt: -1 }).success,
    ).toBe(false);
  });
});

describe("AnalyzeFrameInputSchema", () => {
  it("accepts a frame with valid context", () => {
    expect(
      AnalyzeFrameInputSchema.safeParse({
        frame: { dataUrl: "data:,", capturedAt: 1 },
        context: { mode: "navigate" },
      }).success,
    ).toBe(true);
  });

  it("rejects an invalid context mode", () => {
    expect(
      AnalyzeFrameInputSchema.safeParse({
        frame: { dataUrl: "data:,", capturedAt: 1 },
        context: { mode: "wander" },
      }).success,
    ).toBe(false);
  });
});
