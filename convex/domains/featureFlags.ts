// Feature-flag administration (Increment 12.2). Flags are server-owned: the
// client can read them for presentation, but only a stored row written by an
// administrator changes backend behavior. A flag never replaces a capability
// check — requireFeature is always used alongside requireCapability.
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import { requireAuthenticatedUser, requireCapability } from "../lib/access";
import { writeAudit } from "../lib/audit";
import {
  currentEnvironment,
  defaultFor,
  FEATURE_FLAGS,
  isFlagKey,
} from "../lib/featureFlags";

/** Effective value: the stored override if present, else the env default. */
export async function isFeatureEnabled(
  ctx: QueryCtx | MutationCtx,
  key: string,
): Promise<boolean> {
  if (!isFlagKey(key)) return false;
  const row = await ctx.db
    .query("featureFlags")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  return row?.enabled ?? defaultFor(key, currentEnvironment());
}

/**
 * Gate for backend operations behind a deferred module. Callers still run
 * their own requireCapability: a flag controls whether a module exists,
 * authorization controls who may use it.
 */
export async function requireFeature(
  ctx: QueryCtx | MutationCtx,
  key: string,
): Promise<void> {
  if (!(await isFeatureEnabled(ctx, key))) {
    throw new Error("Feature is not enabled");
  }
}

export const listFlags = query({
  args: {},
  handler: async (ctx) => {
    // Any workforce user may see what is switched on; only config.manage
    // may change it.
    await requireAuthenticatedUser(ctx);
    const environment = currentEnvironment();
    const rows = await ctx.db.query("featureFlags").collect();
    return Object.entries(FEATURE_FLAGS).map(([key, definition]) => {
      const row = rows.find((item) => item.key === key);
      return {
        key,
        label: definition.label,
        regulated: definition.regulated,
        environment,
        environmentDefault: definition.defaults[environment],
        enabled: row?.enabled ?? definition.defaults[environment],
        overridden: row !== undefined,
        approval: row?.approval,
        reason: row?.reason,
      };
    });
  },
});

export const setFlag = mutation({
  args: {
    key: v.string(),
    enabled: v.boolean(),
    reason: v.string(),
    approval: v.optional(
      v.object({
        reference: v.string(),
        approvedBy: v.string(),
        approvedAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "config.manage");
    const definition = FEATURE_FLAGS[args.key];
    if (!definition) throw new Error("Unknown feature flag");
    const reason = args.reason.trim();
    if (!reason) throw new Error("A reason is required");

    // A regulated module cannot go live in production on someone's say-so:
    // the approval record is what the deployment checklist points at.
    if (
      args.enabled &&
      definition.regulated &&
      currentEnvironment() === "production" &&
      !args.approval
    ) {
      throw new Error(
        "This module is regulated: production enablement requires an approval record",
      );
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("featureFlags")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        approval: args.approval ?? existing.approval,
        reason,
        updatedByUserId: actor._id,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("featureFlags", {
        key: args.key,
        enabled: args.enabled,
        approval: args.approval,
        reason,
        updatedByUserId: actor._id,
        createdAt: now,
        updatedAt: now,
      });
    }
    await writeAudit(ctx, {
      actor,
      action: args.enabled ? "feature_flag.enabled" : "feature_flag.disabled",
      entityType: "featureFlags",
      entityId: args.key,
      reason,
    });
  },
});
