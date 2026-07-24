import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  internalAction,
  internalMutation,
  mutation,
  query,
} from "../_generated/server";
import {
  createSelfLink,
  requireAuthenticatedUser,
  requireCapability,
} from "../lib/access";
import { writeAudit } from "../lib/audit";
import {
  generateInvitationToken,
  hashInvitationToken,
  INVITATION_TTL_MS,
} from "../lib/invitations";
import { logEvent } from "../lib/logger";
import { normalizeEmail } from "../lib/patients";

/** Invitation history for one patient; requires patient.manage. No tokens. */
export const listForPatient = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    await requireCapability(ctx, "patient.manage");
    const invitations = await ctx.db
      .query("patientInvitations")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .order("desc")
      .collect();
    return invitations.map((i) => ({
      _id: i._id,
      status: i.status,
      email: i.email,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
      expired: i.status === "pending" && i.expiresAt < Date.now(),
    }));
  },
});

/**
 * Staff creates a portal invitation for a patient. Stores only the token
 * hash; returns the raw activation token once so staff can deliver the link.
 * Also schedules a Clerk invitation email when configured.
 */
export const createInvitation = mutation({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    const actor = await requireCapability(ctx, "patient.manage");
    const patient = await ctx.db.get(patientId);
    if (!patient || patient.status !== "active") {
      throw new Error("Patient not found or not active");
    }
    const email = normalizeEmail(patient.email);
    if (!email) {
      throw new Error("Patient has no email on file");
    }
    const activeLinks = await ctx.db
      .query("patientAccountLinks")
      .withIndex("by_patient", (q) =>
        q.eq("patientId", patientId).eq("status", "active"),
      )
      .collect();
    if (activeLinks.length > 0) {
      throw new Error("Patient already has a linked account");
    }
    const pending = (
      await ctx.db
        .query("patientInvitations")
        .withIndex("by_patient", (q) => q.eq("patientId", patientId))
        .collect()
    ).filter((i) => i.status === "pending" && i.expiresAt > Date.now());
    if (pending.length > 0) {
      throw new Error("An invitation for this patient is already pending");
    }

    const token = generateInvitationToken();
    const now = Date.now();
    const invitationId = await ctx.db.insert("patientInvitations", {
      patientId,
      tokenHash: await hashInvitationToken(token),
      email,
      channel: "email",
      status: "pending",
      expiresAt: now + INVITATION_TTL_MS,
      invitedByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "patient.invitation.created",
      entityType: "patientInvitations",
      entityId: invitationId,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.domains.patientInvitations.deliverClerkInvitation,
      { invitationId, email },
    );
    return { invitationId, token };
  },
});

export const revokeInvitation = mutation({
  args: { invitationId: v.id("patientInvitations"), reason: v.string() },
  handler: async (ctx, { invitationId, reason }) => {
    const actor = await requireCapability(ctx, "patient.manage");
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
      action: "patient.invitation.revoked",
      entityType: "patientInvitations",
      entityId: invitationId,
      reason,
    });
  },
});

export type AcceptResult =
  | { status: "accepted" }
  | { status: "invalid" | "expired" | "revoked" | "consumed" | "mismatch" };

/**
 * Consumes an invitation exactly once for the authenticated user. Business
 * failures return a status (rather than throwing) so the failure audit event
 * is not rolled back with the transaction.
 */
export const acceptInvitation = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<AcceptResult> => {
    const user = await requireAuthenticatedUser(ctx);
    const tokenHash = await hashInvitationToken(token);
    const invitation = await ctx.db
      .query("patientInvitations")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();

    const fail = async (
      status: Exclude<AcceptResult["status"], "accepted">,
    ): Promise<AcceptResult> => {
      await writeAudit(ctx, {
        actor: user,
        action: "patient.invitation.acceptance_failed",
        entityType: "patientInvitations",
        entityId: invitation?._id ?? "unknown",
        reason: status,
      });
      return { status };
    };

    if (!invitation) return await fail("invalid");
    if (invitation.status === "revoked") return await fail("revoked");
    if (invitation.status === "accepted") return await fail("consumed");
    if (invitation.expiresAt < Date.now()) return await fail("expired");
    if (user.type !== "patient") return await fail("mismatch");
    if (normalizeEmail(user.email) !== invitation.email) {
      return await fail("mismatch");
    }

    await createSelfLink(ctx, {
      patientId: invitation.patientId,
      userId: user._id,
      verificationMethod: "invitation",
    });
    await ctx.db.patch(invitation._id, {
      status: "accepted",
      consumedByUserId: user._id,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor: user,
      action: "patient.invitation.accepted",
      entityType: "patientInvitations",
      entityId: invitation._id,
    });
    return { status: "accepted" };
  },
});

/** Sends the Clerk invitation email when a secret is configured. */
export const deliverClerkInvitation = internalAction({
  args: { invitationId: v.id("patientInvitations"), email: v.string() },
  handler: async (ctx, { invitationId, email }) => {
    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) {
      logEvent("warn", "patient.invitation.delivery_skipped_no_secret", {
        entityType: "patientInvitations",
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
        public_metadata: { type: "patient" },
      }),
    });
    if (!response.ok) {
      logEvent("error", "patient.invitation.delivery_failed", {
        entityType: "patientInvitations",
        entityId: invitationId,
      });
      return;
    }
    const body = (await response.json()) as { id: string };
    await ctx.runMutation(
      internal.domains.patientInvitations.markInvitationDelivered,
      { invitationId, clerkInvitationId: body.id },
    );
  },
});

export const markInvitationDelivered = internalMutation({
  args: {
    invitationId: v.id("patientInvitations"),
    clerkInvitationId: v.string(),
  },
  handler: async (ctx, { invitationId, clerkInvitationId }) => {
    await ctx.db.patch(invitationId, {
      clerkInvitationId,
      updatedAt: Date.now(),
    });
  },
});
