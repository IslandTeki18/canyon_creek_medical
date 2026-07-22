import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { logEvent } from "../lib/logger";

const clerkUserFields = {
  clerkUserId: v.string(),
  type: v.union(v.literal("patient"), v.literal("workforce")),
  displayName: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
};

/**
 * Applies a Clerk user.created or user.updated event. Keyed by Clerk user id,
 * so replayed or duplicated webhook deliveries converge on one row.
 */
export const upsertFromClerk = internalMutation({
  args: clerkUserFields,
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) =>
        q.eq("clerkUserId", args.clerkUserId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        displayName: args.displayName,
        email: args.email,
        phone: args.phone,
        updatedAt: now,
      });
      logEvent("info", "users.sync.updated", {
        entityType: "users",
        entityId: existing._id,
      });
      return existing._id;
    }
    const id = await ctx.db.insert("users", {
      ...args,
      // Workforce roles are assigned through user administration (1.4).
      roles: args.type === "patient" ? ["patient"] : [],
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    logEvent("info", "users.sync.created", {
      entityType: "users",
      entityId: id,
    });
    return id;
  },
});

/**
 * Applies a Clerk user.deleted (or revocation) event. Soft-deactivates so
 * history is preserved and any stale session is denied server-side.
 */
export const deactivateFromClerk = internalMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();
    if (!existing) {
      logEvent("warn", "users.sync.delete_unknown_user", {});
      return;
    }
    if (existing.status !== "deactivated") {
      await ctx.db.patch(existing._id, {
        status: "deactivated",
        updatedAt: Date.now(),
      });
    }
    logEvent("info", "users.sync.deactivated", {
      entityType: "users",
      entityId: existing._id,
    });
  },
});

/**
 * Reconciliation for missing or delayed webhook events: an authenticated
 * client can materialize/refresh its own user row from the verified Clerk
 * identity token. Never resurrects a deactivated or suspended user.
 */
export const ensureCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new Error("Not authenticated");
    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) =>
        q.eq("clerkUserId", identity.subject),
      )
      .unique();
    if (existing) return existing._id;
    const id = await ctx.db.insert("users", {
      clerkUserId: identity.subject,
      // ponytail: workforce users are provisioned via invitation (1.4);
      // self-reconciled rows default to patient.
      type: "patient",
      roles: ["patient"],
      status: "active",
      displayName: identity.name ?? "Unknown",
      email: identity.email,
      createdAt: now,
      updatedAt: now,
    });
    logEvent("info", "users.sync.reconciled", {
      entityType: "users",
      entityId: id,
    });
    return id;
  },
});

/** Current user's own record, or null while sync is pending. */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) =>
        q.eq("clerkUserId", identity.subject),
      )
      .unique();
  },
});
