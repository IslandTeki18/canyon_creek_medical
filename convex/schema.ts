import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const roleValidator = v.union(
  v.literal("patient"),
  v.literal("frontDesk"),
  v.literal("clinicalStaff"),
  v.literal("provider"),
  v.literal("administrator"),
  v.literal("auditor"),
);

// Tables land per blueprint increment.
export default defineSchema({
  // One row per Clerk identity. Rows are soft-deactivated, never deleted.
  users: defineTable({
    clerkUserId: v.string(),
    type: v.union(v.literal("patient"), v.literal("workforce")),
    status: v.union(
      v.literal("active"),
      v.literal("suspended"),
      v.literal("deactivated"),
    ),
    // Role assignments; capabilities derive from these in lib/permissions.
    roles: v.array(roleValidator),
    displayName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_clerk_user_id", ["clerkUserId"]),

  // Staff invitation intents. Roles are assigned here, before first access;
  // the Clerk user.created webhook applies them on acceptance.
  workforceInvitations: defineTable({
    email: v.string(),
    roles: v.array(roleValidator),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("revoked"),
    ),
    invitedByUserId: v.id("users"),
    clerkInvitationId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_email", ["email"]),

  // Append-only audit trail for sensitive actions. Never edited or deleted.
  auditEvents: defineTable({
    actorUserId: v.optional(v.id("users")),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_entity", ["entityType", "entityId"])
    .index("by_actor", ["actorUserId"]),
});
