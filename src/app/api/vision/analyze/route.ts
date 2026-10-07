import { createAnalyzeHandler } from "./handler";
import { resolveVisionProvider } from "./resolve-provider";

// Node runtime: the Gemini SDK and the API key are server-only.
export const runtime = "nodejs";
// Each frame is analysed on demand; never cache a perception result.
export const dynamic = "force-dynamic";

export const POST = createAnalyzeHandler({
  resolveProvider: ({ useFixtures }) => resolveVisionProvider({ useFixtures }),
});
