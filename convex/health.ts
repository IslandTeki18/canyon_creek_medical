import { query } from "./_generated/server";

// Public readiness probe. Returns no secrets and no data — reaching the
// database at all is the signal.
export const ping = query({
  args: {},
  handler: async () => ({ ok: true as const }),
});
