import { getServerEnv, type ServerEnv } from "@/config/server-env";
import { AiProviderError, type VisionProvider } from "@/providers";
import { FixtureVisionProvider } from "@/providers";
import { GeminiVisionProvider } from "@/providers/gemini";

/**
 * Choose the vision provider for a request. The fixture provider is used only
 * outside production, and only when explicitly requested or when no API key is
 * configured — so a missing key in development degrades to fixtures rather than
 * failing. The Gemini provider (and the API key it holds) never reaches here in
 * the browser: this module is server-only.
 */
export function resolveVisionProvider(
  options: { useFixtures?: boolean } = {},
  env: ServerEnv = getServerEnv(),
): VisionProvider {
  const isProd = env.NODE_ENV === "production";
  const fixturesAllowed = !isProd;
  const fixturesRequested =
    options.useFixtures === true ||
    env.VISION_FIXTURES === "1" ||
    env.VISION_FIXTURES === "true";

  if (fixturesAllowed && (fixturesRequested || !env.GEMINI_API_KEY)) {
    return new FixtureVisionProvider();
  }

  if (!env.GEMINI_API_KEY) {
    // No key and fixtures are not allowed (production): fail honestly.
    throw new AiProviderError("The AI provider is not configured.");
  }

  return new GeminiVisionProvider({
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL,
  });
}
