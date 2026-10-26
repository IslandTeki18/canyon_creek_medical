import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const roleValidator = v.literal("administrator");

export default defineSchema({
  // Visitor text may contain health details: never log it or put it in audit reasons or URLs.
  contactInquiries: defineTable({
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    message: v.string(),
    status: v.union(
      v.literal("new"),
      v.literal("handled"),
      v.literal("archived"),
    ),
    handledByUserId: v.optional(v.id("users")),
    handledAt: v.optional(v.number()),
    archiveReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status_created", ["status", "createdAt"]),

  // One row per Clerk identity. Rows are soft-deactivated, never deleted.
  users: defineTable({
    clerkUserId: v.string(),
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

  // Append-only audit trail for sensitive actions. Never edited or deleted:
  // no mutation in the codebase patches or removes a row here. Severity is
  // derived from the action in lib/audit so classification never drifts
  // between call sites (12.5).
  auditEvents: defineTable({
    actorUserId: v.optional(v.id("users")),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    reason: v.optional(v.string()), // operational text, never PHI
    correlationId: v.optional(v.string()),
    severity: v.optional(
      v.union(v.literal("info"), v.literal("notice"), v.literal("high")),
    ),
    createdAt: v.number(),
  })
    .index("by_entity", ["entityType", "entityId"])
    .index("by_actor", ["actorUserId"])
    .index("by_created", ["createdAt"])
    .index("by_action", ["action", "createdAt"])
    .index("by_severity", ["severity", "createdAt"]),

  servicePages: defineTable({
    slug: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("archived"),
    ),
    sortOrder: v.number(),
    content: v.optional(v.any()), // Published ServicePageContent
    draftContent: v.optional(v.any()), // Working copy, admin-only
    draftUpdatedAt: v.optional(v.number()),
    draftUpdatedByUserId: v.optional(v.id("users")),
    publishedAt: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
    archiveReason: v.optional(v.string()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status", "sortOrder"]),

  blogPosts: defineTable({
    slug: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("archived"),
    ),
    content: v.optional(v.any()), // Published BlogPostContent
    draftContent: v.optional(v.any()), // Working copy, admin-only
    draftUpdatedAt: v.optional(v.number()),
    draftUpdatedByUserId: v.optional(v.id("users")),
    publishedAt: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
    archiveReason: v.optional(v.string()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status_published", ["status", "publishedAt"]),
});
