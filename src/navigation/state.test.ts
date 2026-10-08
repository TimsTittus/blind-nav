import { describe, expect, it } from "vitest";
import { transitionLocation } from "./state";

describe("transitionLocation", () => {
  it("permission_required -> acquiring on REQUEST", () => {
    expect(transitionLocation("permission_required", { type: "REQUEST" })).toBe(
      "acquiring",
    );
  });

  it("permission_required -> unsupported on UNSUPPORTED", () => {
    expect(
      transitionLocation("permission_required", { type: "UNSUPPORTED" }),
    ).toBe("unsupported");
  });

  it("acquiring -> active on ACQUIRED", () => {
    expect(transitionLocation("acquiring", { type: "ACQUIRED" })).toBe(
      "active",
    );
  });

  it("acquiring -> permission_denied on DENIED", () => {
    expect(transitionLocation("acquiring", { type: "DENIED" })).toBe(
      "permission_denied",
    );
  });

  it("acquiring -> error on FAILED", () => {
    expect(transitionLocation("acquiring", { type: "FAILED" })).toBe("error");
  });

  it("acquiring -> permission_required on STOP", () => {
    expect(transitionLocation("acquiring", { type: "STOP" })).toBe(
      "permission_required",
    );
  });

  it("active -> stale on STALE", () => {
    expect(transitionLocation("active", { type: "STALE" })).toBe("stale");
  });

  it("active -> error on FAILED", () => {
    expect(transitionLocation("active", { type: "FAILED" })).toBe("error");
  });

  it("stale -> active on ACQUIRED", () => {
    expect(transitionLocation("stale", { type: "ACQUIRED" })).toBe("active");
  });

  it("error -> acquiring on REQUEST", () => {
    expect(transitionLocation("error", { type: "REQUEST" })).toBe("acquiring");
  });

  it("permission_denied -> acquiring on REQUEST (retry)", () => {
    expect(transitionLocation("permission_denied", { type: "REQUEST" })).toBe(
      "acquiring",
    );
  });

  it("returns null for illegal transitions", () => {
    expect(transitionLocation("active", { type: "REQUEST" })).toBeNull();
    expect(
      transitionLocation("permission_required", { type: "ACQUIRED" }),
    ).toBeNull();
  });
});
