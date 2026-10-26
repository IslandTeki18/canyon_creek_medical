import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { writeAudit } from "../lib/audit";
import { logEvent } from "../lib/logger";

const clerkUserFields = {
  clerkUserId: v.string(),
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
      roles: [],
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
 * One-time first-admin bootstrap.
 * Internal-only: runs from the CLI (`npx convex run`), never from clients.
 * Refuses once any active administrator exists — later role changes go
 * through the Convex dashboard.
 *
 *   npx convex run domains/users:bootstrapAdministrator \
 *     '{"clerkUserId":"user_...","displayName":"Your Name","email":"you@example.com"}'
 */
export const bootstrapAdministrator = internalMutation({
  args: {
    clerkUserId: v.string(),
    displayName: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const users = await ctx.db.query("users").collect();
    if (
      users.some(
        (u) => u.roles.includes("administrator") && u.status === "active",
      )
    ) {
      throw new Error("An active administrator already exists.");
    }
    const now = Date.now();
    const existing = users.find((u) => u.clerkUserId === args.clerkUserId);
    let id;
    if (existing) {
      await ctx.db.patch(existing._id, {
        roles: ["administrator"],
        updatedAt: now,
      });
      id = existing._id;
    } else {
      id = await ctx.db.insert("users", {
        ...args,
        roles: ["administrator"],
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    }
    await writeAudit(ctx, {
      action: "workforce.administrator.bootstrapped",
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
      roles: [],
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
