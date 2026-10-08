import { createQueryHandler } from "./handler";
import { resolveVisionProvider } from "../analyze/resolve-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createQueryHandler({
  resolveProvider: ({ useFixtures }) => resolveVisionProvider({ useFixtures }),
});
