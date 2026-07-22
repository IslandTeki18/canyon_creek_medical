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

/**
 * Ownership check for patient-scoped resources.
 * ponytail: compares owning user id until patientAccountLinks lands in 3.1,
 * which will map Convex users to patient records with relationship types.
 */
export async function requirePatientOwnership(
  ctx: QueryCtx | MutationCtx,
  ownerUserId: Id<"users">,
): Promise<Doc<"users">> {
  const user = await requireAuthenticatedUser(ctx);
  if (user._id !== ownerUserId) throw new Error("Not authorized");
  return user;
}
