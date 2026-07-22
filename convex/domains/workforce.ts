import { query } from "../_generated/server";
import { requireCapability } from "../lib/access";

/** Workforce user directory; requires user.manage. */
export const listWorkforceUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "user.manage");
    const users = await ctx.db.query("users").collect();
    return users
      .filter((u) => u.type === "workforce")
      .map((u) => ({
        _id: u._id,
        displayName: u.displayName,
        email: u.email,
        roles: u.roles,
        status: u.status,
      }));
  },
});
