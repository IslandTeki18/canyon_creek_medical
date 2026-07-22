// ponytail: queryGeneric until `npx convex dev` first generates convex/_generated;
// then switch to `query` from "./_generated/server".
import { queryGeneric } from "convex/server";

// Public readiness probe. Returns no secrets and no data — reaching the
// database at all is the signal.
export const ping = queryGeneric({
  args: {},
  handler: async () => ({ ok: true as const }),
});
