// Security events recorded from HTTP endpoints. Audit review UI was removed; rows remain queryable from the dashboard.
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const recordSecurityEvent = internalMutation({
  args: {
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    correlationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditEvents", {
      action: `security.${args.action}`,
      entityType: args.entityType,
      entityId: args.entityId,
      correlationId: args.correlationId,
      severity: "high",
      createdAt: Date.now(),
    });
  },
});
