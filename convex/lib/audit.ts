import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Appends an audit event. Reasons are typed operational text, never PHI. */
export async function writeAudit(
  ctx: MutationCtx,
  event: {
    actor?: Doc<"users">;
    action: string;
    entityType: string;
    entityId: string;
    reason?: string;
  },
): Promise<void> {
  await ctx.db.insert("auditEvents", {
    actorUserId: event.actor?._id,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    reason: event.reason,
    createdAt: Date.now(),
  });
}
