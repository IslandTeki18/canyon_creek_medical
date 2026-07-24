import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { hasCapability, type Capability } from "./permissions";

/**
 * Loads the acting user and rejects anyone unauthenticated, unknown, or not
 * active. Because status lives in Convex, suspension/deactivation takes
 * effect immediately even if a stale Clerk client session remains.
 */
export async function requireAuthenticatedUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throw new Error("Not authenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
  if (!user) throw new Error("Not authenticated");
  if (user.status !== "active") throw new Error("Account is not active");
  return user;
}

export async function requireCapability(
  ctx: QueryCtx | MutationCtx,
  capability: Capability,
): Promise<Doc<"users">> {
  const user = await requireAuthenticatedUser(ctx);
  if (!hasCapability(user.roles, capability)) {
    throw new Error("Not authorized");
  }
  return user;
}

/** Active link for a user, or null. A user has at most one active self link. */
export async function activeLinkForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"patientAccountLinks"> | null> {
  return await ctx.db
    .query("patientAccountLinks")
    .withIndex("by_user", (q) => q.eq("userId", userId).eq("status", "active"))
    .unique();
}

/**
 * Ownership check for patient-scoped resources: the caller must hold an
 * active link to the given patient. Link creation is server-controlled
 * (invitation flow), so client manipulation cannot reach another patient.
 */
export async function requirePatientOwnership(
  ctx: QueryCtx | MutationCtx,
  patientId: Id<"patients">,
): Promise<Doc<"users">> {
  const user = await requireAuthenticatedUser(ctx);
  const link = await activeLinkForUser(ctx, user._id);
  if (!link || link.patientId !== patientId) throw new Error("Not authorized");
  return user;
}

/**
 * Resolves the caller's own linked patient. Portal queries scope everything
 * through this so a patient can only ever read their own record.
 */
export async function requireLinkedPatient(
  ctx: QueryCtx | MutationCtx,
): Promise<{ user: Doc<"users">; patient: Doc<"patients"> }> {
  const user = await requireAuthenticatedUser(ctx);
  const link = await activeLinkForUser(ctx, user._id);
  if (!link) throw new Error("No linked patient record");
  const patient = await ctx.db.get(link.patientId);
  if (!patient || patient.status !== "active") {
    throw new Error("No linked patient record");
  }
  return { user, patient };
}

/**
 * Creates the self link. Enforces one active self relationship per user and
 * per patient. Only "self" is enabled; guardian/proxy exist in the schema for
 * later increments.
 */
export async function createSelfLink(
  ctx: MutationCtx,
  args: {
    patientId: Id<"patients">;
    userId: Id<"users">;
    verificationMethod: string;
  },
): Promise<Id<"patientAccountLinks">> {
  const forUser = await activeLinkForUser(ctx, args.userId);
  if (forUser) throw new Error("Account is already linked to a patient");
  const forPatient = await ctx.db
    .query("patientAccountLinks")
    .withIndex("by_patient", (q) =>
      q.eq("patientId", args.patientId).eq("status", "active"),
    )
    .collect();
  if (forPatient.some((l) => l.relationshipType === "self")) {
    throw new Error("Patient already has a linked account");
  }
  const now = Date.now();
  return await ctx.db.insert("patientAccountLinks", {
    patientId: args.patientId,
    userId: args.userId,
    relationshipType: "self",
    status: "active",
    verificationMethod: args.verificationMethod,
    createdAt: now,
    updatedAt: now,
  });
}
