import { describe, expect, it } from "vitest";
import { resolveHeading } from "./heading";

describe("resolveHeading", () => {
  it("returns null when both sources are null", () => {
    expect(resolveHeading(null, null)).toBeNull();
  });

  it("returns GPS heading when only GPS is available", () => {
    const result = resolveHeading({ degrees: 90, timestamp: 100 }, null);
    expect(result).toEqual({
      degrees: 90,
      source: "gps",
      timestamp: 100,
    });
  });

  it("returns device orientation heading when only device is available", () => {
    const result = resolveHeading(null, {
      degrees: 180,
      accuracyDegrees: 5,
      timestamp: 200,
    });
    expect(result).toEqual({
      degrees: 180,
      source: "device_orientation",
      accuracyDegrees: 5,
      timestamp: 200,
    });
  });

  it("prefers device orientation when it is newer", () => {
    const result = resolveHeading(
      { degrees: 90, timestamp: 100 },
      { degrees: 180, timestamp: 200 },
    );
    expect(result?.source).toBe("device_orientation");
    expect(result?.degrees).toBe(180);
  });

  it("prefers GPS when it is newer", () => {
    const result = resolveHeading(
      { degrees: 90, timestamp: 300 },
      { degrees: 180, timestamp: 200 },
    );
    expect(result?.source).toBe("gps");
    expect(result?.degrees).toBe(90);
  });

  it("prefers device orientation when timestamps are equal", () => {
    const result = resolveHeading(
      { degrees: 90, timestamp: 100 },
      { degrees: 180, timestamp: 100 },
    );
    expect(result?.source).toBe("device_orientation");
  });
});
