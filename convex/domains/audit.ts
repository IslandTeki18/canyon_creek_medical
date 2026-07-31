// Audit review (Increment 12.5). Auditors and administrators read the
// append-only trail; nothing in the codebase edits or deletes a row, and
// this module exposes no mutation that could. Events carry actor, action,
// entity, timestamp, reason, correlation id, and severity — operational
// metadata only, never clinical content, so reviewing a sequence never
// grants access to the records it describes.
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, query, type QueryCtx } from "../_generated/server";
import { requireCapability } from "../lib/access";
import { severityForAction } from "../lib/audit";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

async function decorate(ctx: QueryCtx, events: Doc<"auditEvents">[]) {
  return await Promise.all(
    events.map(async (event) => {
      const actor = event.actorUserId
        ? await ctx.db.get(event.actorUserId)
        : null;
      return {
        _id: event._id,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        reason: event.reason,
        correlationId: event.correlationId,
        // Older rows predate stored severity; derive it the same way.
        severity: event.severity ?? severityForAction(event.action),
        createdAt: event.createdAt,
        actorName: actor?.displayName ?? "(system)",
        actorUserId: event.actorUserId,
      };
    }),
  );
}

/**
 * Filtered audit search. Filters compose in memory over an indexed slice:
 * the narrowest available index is chosen first, then the remaining
 * predicates are applied.
 */
export const listEvents = query({
  args: {
    actorUserId: v.optional(v.id("users")),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    action: v.optional(v.string()), // prefix match
    severity: v.optional(
      v.union(v.literal("info"), v.literal("notice"), v.literal("high")),
    ),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, "audit.view");
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    let events: Doc<"auditEvents">[];
    if (args.entityType && args.entityId) {
      events = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", args.entityType!).eq("entityId", args.entityId!),
        )
        .order("desc")
        .collect();
    } else if (args.actorUserId) {
      events = await ctx.db
        .query("auditEvents")
        .withIndex("by_actor", (q) => q.eq("actorUserId", args.actorUserId))
        .order("desc")
        .collect();
    } else if (args.severity) {
      events = await ctx.db
        .query("auditEvents")
        .withIndex("by_severity", (q) => q.eq("severity", args.severity))
        .order("desc")
        .take(MAX_LIMIT * 4);
    } else {
      events = await ctx.db
        .query("auditEvents")
        .withIndex("by_created")
        .order("desc")
        .take(MAX_LIMIT * 4);
    }

    const filtered = events
      .filter(
        (event) => !args.entityType || event.entityType === args.entityType,
      )
      .filter((event) => !args.action || event.action.startsWith(args.action))
      .filter(
        (event) =>
          !args.severity ||
          (event.severity ?? severityForAction(event.action)) === args.severity,
      )
      .filter(
        (event) => args.from === undefined || event.createdAt >= args.from,
      )
      .filter((event) => args.to === undefined || event.createdAt <= args.to)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
    return await decorate(ctx, filtered);
  },
});

/**
 * The events an auditor should see without knowing what to search for:
 * exports, role changes, clinical overrides, break-glass access, and
 * integration trust failures.
 */
export const listHighPriority = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireCapability(ctx, "audit.view");
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const events = await ctx.db
      .query("auditEvents")
      .withIndex("by_severity", (q) => q.eq("severity", "high"))
      .order("desc")
      .take(limit);
    return await decorate(ctx, events);
  },
});

/** Everything recorded about one entity, oldest first: the reconstruction. */
export const entityHistory = query({
  args: { entityType: v.string(), entityId: v.string() },
  handler: async (ctx, args) => {
    await requireCapability(ctx, "audit.view");
    const events = await ctx.db
      .query("auditEvents")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId),
      )
      .collect();
    return await decorate(
      ctx,
      events.sort((a, b) => a.createdAt - b.createdAt),
    );
  },
});

/**
 * Records a trust-boundary failure from an HTTP action (webhook signature
 * verification). Internal-only: no client can write an audit row.
 */
export const recordSecurityEvent = internalMutation({
  args: {
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    correlationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditEvents", {
      action: `security.${args.action}`,
      entityType: args.entityType,
      entityId: args.entityId,
      correlationId: args.correlationId,
      severity: "high",
      createdAt: Date.now(),
    });
  },
});

/** Convenience for the audit UI's actor filter. */
export const listActors = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "audit.view");
    const users = await ctx.db.query("users").collect();
    return users
      .filter((user) => user.type === "workforce")
      .map((user) => ({ _id: user._id, displayName: user.displayName }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  },
});

export type AuditActor = { _id: Id<"users">; displayName: string };
