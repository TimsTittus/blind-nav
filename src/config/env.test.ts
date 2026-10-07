import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./server-env";

describe("parseServerEnv", () => {
  it("applies defaults when values are absent", () => {
    const env = parseServerEnv({});
    expect(env.NODE_ENV).toBe("development");
    expect(env.GEMINI_MODEL).toBe("gemini-2.5-flash");
    expect(env.GEMINI_API_KEY).toBeUndefined();
  });

  it("accepts a fully specified environment and ignores unrelated keys", () => {
    const env = parseServerEnv({
      NODE_ENV: "production",
      GEMINI_API_KEY: "secret",
      GEMINI_MODEL: "gemini-x",
      PATH: "/usr/bin",
    });
    expect(env.NODE_ENV).toBe("production");
    expect(env.GEMINI_API_KEY).toBe("secret");
    expect(env.GEMINI_MODEL).toBe("gemini-x");
    expect("PATH" in env).toBe(false);
  });

  it("rejects an empty (but present) secret", () => {
    expect(() => parseServerEnv({ GEMINI_API_KEY: "" })).toThrow();
  });

  it("rejects an invalid NODE_ENV", () => {
    expect(() => parseServerEnv({ NODE_ENV: "staging" })).toThrow();
  });
});
