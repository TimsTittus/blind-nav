import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("toolchain", () => {
  it("runs the Vitest harness", () => {
    expect(true).toBe(true);
  });

  it("parses valid data with Zod", () => {
    const schema = z.object({ ok: z.boolean() });
    expect(schema.parse({ ok: true })).toEqual({ ok: true });
  });

  it("rejects invalid data with Zod (never trust unvalidated input)", () => {
    const schema = z.object({ ok: z.boolean() });
    const result = schema.safeParse({ ok: "yes" });
    expect(result.success).toBe(false);
  });
});
