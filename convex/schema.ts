import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
    displayName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_clerk_user_id", ["clerkUserId"]),
});
