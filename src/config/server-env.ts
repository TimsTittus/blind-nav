import { z } from "zod";

const ServerEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  /**
   * Dev-only switch to force the canned fixture vision provider even when a
   * Gemini key is present. Ignored in production. "1" or "true" to enable.
   */
  VISION_FIXTURES: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export function parseServerEnv(
  source: Record<string, string | undefined>,
): ServerEnv {
  return ServerEnvSchema.parse(source);
}

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error(
      "getServerEnv() must never be called in the browser — secrets are server-only.",
    );
  }
  cached ??= parseServerEnv(process.env);
  return cached;
}
