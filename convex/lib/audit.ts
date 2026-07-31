import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const AUDIT_SEVERITIES = ["info", "notice", "high"] as const;
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

/**
 * Actions an auditor must be able to find without knowing what to search
 * for: privilege changes, data leaving the system, clinical hard-stop
 * overrides, break-glass access, and integration trust failures (12.5).
 * Matching is by prefix so future actions in these families inherit it.
 */
const HIGH_PRIORITY_PREFIXES = [
  "report.exported",
  "workforce.user.roles_changed",
  "workforce.administrator.bootstrapped",
  "security.", // signature verification and other trust-boundary failures
  "ketamine.session.ready_override",
  "ketamine.discharge.override",
  "break_glass.",
];

/** Actions worth surfacing above routine reads but below high priority. */
const NOTICE_PREFIXES = [
  "feature_flag.",
  "administration.service.",
  "patient.invitation.acceptance_failed",
  "document.downloaded",
  "encounter.amended",
  "alert.",
];

export function severityForAction(action: string): AuditSeverity {
  if (HIGH_PRIORITY_PREFIXES.some((prefix) => action.startsWith(prefix))) {
    return "high";
  }
  if (NOTICE_PREFIXES.some((prefix) => action.startsWith(prefix))) {
    return "notice";
  }
  return "info";
}

/**
 * Appends an audit event. Reasons are typed operational text, never PHI.
 * Severity is derived from the action so every call site classifies
 * consistently; callers may override for a specific escalation.
 */
export async function writeAudit(
  ctx: MutationCtx,
  event: {
    actor?: Doc<"users">;
    action: string;
    entityType: string;
    entityId: string;
    reason?: string;
    correlationId?: string;
    severity?: AuditSeverity;
  },
): Promise<void> {
  await ctx.db.insert("auditEvents", {
    actorUserId: event.actor?._id,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    reason: event.reason,
    correlationId: event.correlationId,
    severity: event.severity ?? severityForAction(event.action),
    createdAt: Date.now(),
  });
}
