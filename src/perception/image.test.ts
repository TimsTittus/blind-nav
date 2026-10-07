import { describe, expect, it } from "vitest";
import { isAppError } from "@/core";
import { base64ByteLength, decodeImageDataUrl } from "./image";
import { MAX_IMAGE_BYTES } from "./config";

const PAYLOAD = "/9j/4AAQSkZJRgABAQAAAQABAAD/".repeat(8);

describe("base64ByteLength", () => {
  it("computes decoded length accounting for padding", () => {
    expect(base64ByteLength("")).toBe(0);
    expect(base64ByteLength("QQ==")).toBe(1);
    expect(base64ByteLength("QUJD")).toBe(3);
  });
});

describe("decodeImageDataUrl", () => {
  it("accepts a well-formed JPEG data URL", () => {
    const decoded = decodeImageDataUrl(`data:image/jpeg;base64,${PAYLOAD}`);
    expect(decoded.mimeType).toBe("image/jpeg");
    expect(decoded.byteLength).toBeGreaterThan(0);
  });

  it("rejects a non-string / empty input", () => {
    expect(() => decodeImageDataUrl(undefined)).toThrowError();
    expect(() => decodeImageDataUrl("")).toThrowError();
  });

  it("rejects a non-data URL", () => {
    expect(() =>
      decodeImageDataUrl("https://example.com/a.jpg"),
    ).toThrowError();
  });

  it("rejects an unsupported MIME type", () => {
    try {
      decodeImageDataUrl(`data:image/gif;base64,${PAYLOAD}`);
      throw new Error("should have thrown");
    } catch (error) {
      expect(isAppError(error) && error.code).toBe("invalid_image");
    }
  });

  it("rejects a too-small image", () => {
    expect(() => decodeImageDataUrl("data:image/jpeg;base64,QQ==")).toThrow();
  });

  it("rejects an oversized image", () => {
    const huge = "A".repeat(MAX_IMAGE_BYTES * 2);
    try {
      decodeImageDataUrl(`data:image/jpeg;base64,${huge}`);
      throw new Error("should have thrown");
    } catch (error) {
      expect(isAppError(error) && error.code).toBe("invalid_image");
    }
  });
});
