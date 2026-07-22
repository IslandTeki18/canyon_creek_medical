import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  internalAction,
  internalMutation,
  mutation,
  query,
} from "../_generated/server";
import { requireCapability } from "../lib/access";
import { writeAudit } from "../lib/audit";
import { logEvent } from "../lib/logger";
import { roleValidator } from "../schema";

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

/** Workforce user detail with its audit trail; requires user.manage. */
export const getWorkforceUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireCapability(ctx, "user.manage");
    const user = await ctx.db.get(userId);
    if (!user || user.type !== "workforce") return null;
    const auditEvents = await ctx.db
      .query("auditEvents")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "users").eq("entityId", userId),
      )
      .order("desc")
      .take(50);
    return { user, auditEvents };
  },
});

export const listInvitations = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "user.manage");
    return await ctx.db.query("workforceInvitations").collect();
  },
});

/**
 * Records the invitation intent (email + approved roles) and schedules
 * delivery through Clerk. Roles are applied by the user.created webhook when
 * the invitation is accepted, so they exist before first access.
 */
export const inviteWorkforceUser = mutation({
  args: { email: v.string(), roles: v.array(roleValidator) },
  handler: async (ctx, { email, roles }) => {
    const actor = await requireCapability(ctx, "user.manage");
    const normalized = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalized)) throw new Error("Invalid email");
    if (roles.length === 0 || roles.includes("patient")) {
      throw new Error("Workforce invitations require workforce roles");
    }
    const existing = await ctx.db
      .query("workforceInvitations")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .collect();
    if (existing.some((i) => i.status === "pending")) {
      throw new Error("An invitation for this email is already pending");
    }
    const now = Date.now();
    const id = await ctx.db.insert("workforceInvitations", {
      email: normalized,
      roles,
      status: "pending",
      invitedByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "workforce.invitation.created",
      entityType: "workforceInvitations",
      entityId: id,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.domains.workforce.deliverClerkInvitation,
      { invitationId: id, email: normalized },
    );
    return id;
  },
});

export const revokeInvitation = mutation({
  args: { invitationId: v.id("workforceInvitations"), reason: v.string() },
  handler: async (ctx, { invitationId, reason }) => {
    const actor = await requireCapability(ctx, "user.manage");
    if (!reason.trim()) throw new Error("A reason is required");
    const invitation = await ctx.db.get(invitationId);
    if (!invitation || invitation.status !== "pending") {
      throw new Error("Invitation is not pending");
    }
    await ctx.db.patch(invitationId, {
      status: "revoked",
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "workforce.invitation.revoked",
      entityType: "workforceInvitations",
      entityId: invitationId,
      reason,
    });
  },
});

/** Calls the Clerk invitations API when a secret is configured. */
export const deliverClerkInvitation = internalAction({
  args: { invitationId: v.id("workforceInvitations"), email: v.string() },
  handler: async (ctx, { invitationId, email }) => {
    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) {
      logEvent("warn", "workforce.invitation.delivery_skipped_no_secret", {
        entityType: "workforceInvitations",
        entityId: invitationId,
      });
      return;
    }
    const response = await fetch("https://api.clerk.com/v1/invitations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email_address: email,
        public_metadata: { type: "workforce" },
      }),
    });
    if (!response.ok) {
      logEvent("error", "workforce.invitation.delivery_failed", {
        entityType: "workforceInvitations",
        entityId: invitationId,
      });
      return;
    }
    const body = (await response.json()) as { id: string };
    await ctx.runMutation(internal.domains.workforce.markInvitationDelivered, {
      invitationId,
      clerkInvitationId: body.id,
    });
  },
});

export const markInvitationDelivered = internalMutation({
  args: {
    invitationId: v.id("workforceInvitations"),
    clerkInvitationId: v.string(),
  },
  handler: async (ctx, { invitationId, clerkInvitationId }) => {
    await ctx.db.patch(invitationId, {
      clerkInvitationId,
      updatedAt: Date.now(),
    });
  },
});

const STATUS_ACTIONS: Record<"active" | "suspended" | "deactivated", string> = {
  active: "workforce.user.reactivated",
  suspended: "workforce.user.suspended",
  deactivated: "workforce.user.deactivated",
};

/** Status changes require a reason and take effect server-side immediately. */
export const setWorkforceUserStatus = mutation({
  args: {
    userId: v.id("users"),
    status: v.union(
      v.literal("active"),
      v.literal("suspended"),
      v.literal("deactivated"),
    ),
    reason: v.string(),
  },
  handler: async (ctx, { userId, status, reason }) => {
    const actor = await requireCapability(ctx, "user.manage");
    if (!reason.trim()) throw new Error("A reason is required");
    if (actor._id === userId) {
      throw new Error("You cannot change your own status");
    }
    const user = await ctx.db.get(userId);
    if (!user || user.type !== "workforce") {
      throw new Error("Workforce user not found");
    }
    if (user.status !== status) {
      await ctx.db.patch(userId, { status, updatedAt: Date.now() });
    }
    await writeAudit(ctx, {
      actor,
      action: STATUS_ACTIONS[status],
      entityType: "users",
      entityId: userId,
      reason,
    });
  },
});

/** Role changes require a reason and are audited. */
export const setWorkforceUserRoles = mutation({
  args: {
    userId: v.id("users"),
    roles: v.array(roleValidator),
    reason: v.string(),
  },
  handler: async (ctx, { userId, roles, reason }) => {
    const actor = await requireCapability(ctx, "user.manage");
    if (!reason.trim()) throw new Error("A reason is required");
    if (roles.includes("patient")) {
      throw new Error("Workforce users cannot hold the patient role");
    }
    const user = await ctx.db.get(userId);
    if (!user || user.type !== "workforce") {
      throw new Error("Workforce user not found");
    }
    await ctx.db.patch(userId, { roles, updatedAt: Date.now() });
    await writeAudit(ctx, {
      actor,
      action: "workforce.user.roles_changed",
      entityType: "users",
      entityId: userId,
      reason,
    });
  },
});
