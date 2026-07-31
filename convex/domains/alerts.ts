// Clinical alerts (Increment 11.4). High-value chart warnings, authored
// deliberately by clinical staff. Alerts surface only in authorized chart
// contexts: no query here feeds search, queues, or notifications, and
// patients never read them. Expired alerts are archived, never deleted.
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { requireCapability } from "../lib/access";
import { writeAudit } from "../lib/audit";
import { hasCapability } from "../lib/permissions";

const severityValidator = v.union(
  v.literal("info"),
  v.literal("warning"),
  v.literal("critical"),
);
const visibilityValidator = v.union(
  v.literal("careTeam"),
  v.literal("allStaff"),
);

function requireText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  return trimmed;
}

/** An alert is in force when active and inside its effective window. */
export function isInForce(alert: Doc<"patientAlerts">, now: number): boolean {
  return (
    alert.status === "active" &&
    alert.effectiveFrom <= now &&
    (alert.effectiveTo === undefined || alert.effectiveTo > now)
  );
}

function canRead(user: Doc<"users">, alert: Doc<"patientAlerts">): boolean {
  return alert.visibility === "allStaff"
    ? hasCapability(user.roles, "patient.read")
    : hasCapability(user.roles, "clinical.manage");
}

export const createAlert = mutation({
  args: {
    patientId: v.id("patients"),
    type: v.string(),
    severity: severityValidator,
    message: v.string(),
    visibility: visibilityValidator,
    reason: v.string(),
    effectiveFrom: v.optional(v.number()),
    effectiveTo: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const patient = await ctx.db.get(args.patientId);
    if (!patient) throw new Error("Patient not found");
    const now = Date.now();
    const effectiveFrom = args.effectiveFrom ?? now;
    if (args.effectiveTo !== undefined && args.effectiveTo <= effectiveFrom) {
      throw new Error("The alert must expire after it takes effect");
    }
    const alertId = await ctx.db.insert("patientAlerts", {
      patientId: args.patientId,
      type: requireText(args.type, "Alert type"),
      severity: args.severity,
      message: requireText(args.message, "Alert message"),
      visibility: args.visibility,
      effectiveFrom,
      effectiveTo: args.effectiveTo,
      status: "active",
      reason: requireText(args.reason, "Reason"),
      authorUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "alert.created",
      entityType: "patientAlerts",
      entityId: alertId,
      reason: args.severity,
    });
    return alertId;
  },
});

export const updateAlert = mutation({
  args: {
    alertId: v.id("patientAlerts"),
    severity: v.optional(severityValidator),
    message: v.optional(v.string()),
    visibility: v.optional(visibilityValidator),
    effectiveTo: v.optional(v.number()),
    reason: v.string(), // every change is explained
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const alert = await ctx.db.get(args.alertId);
    if (!alert) throw new Error("Alert not found");
    if (alert.status === "archived") throw new Error("Alert is archived");
    const reason = requireText(args.reason, "Reason");
    if (
      args.effectiveTo !== undefined &&
      args.effectiveTo <= alert.effectiveFrom
    ) {
      throw new Error("The alert must expire after it takes effect");
    }
    await ctx.db.patch(alert._id, {
      severity: args.severity ?? alert.severity,
      message: args.message
        ? requireText(args.message, "Alert message")
        : alert.message,
      visibility: args.visibility ?? alert.visibility,
      effectiveTo: args.effectiveTo ?? alert.effectiveTo,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "alert.updated",
      entityType: "patientAlerts",
      entityId: alert._id,
      reason,
    });
  },
});

export const archiveAlert = mutation({
  args: { alertId: v.id("patientAlerts"), reason: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const alert = await ctx.db.get(args.alertId);
    if (!alert) throw new Error("Alert not found");
    if (alert.status === "archived") throw new Error("Alert is archived");
    const reason = requireText(args.reason, "Reason");
    const now = Date.now();
    await ctx.db.patch(alert._id, {
      status: "archived",
      archivedAt: now,
      archiveReason: reason,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "alert.archived",
      entityType: "patientAlerts",
      entityId: alert._id,
      reason,
    });
  },
});

export const acknowledgeAlert = mutation({
  args: { alertId: v.id("patientAlerts") },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "patient.read");
    const alert = await ctx.db.get(args.alertId);
    if (!alert) throw new Error("Alert not found");
    if (!canRead(actor, alert)) throw new Error("Not authorized");
    const existing = await ctx.db
      .query("patientAlertAcknowledgements")
      .withIndex("by_alert_user", (q) =>
        q.eq("alertId", alert._id).eq("userId", actor._id),
      )
      .unique();
    if (existing) return; // acknowledgement is idempotent per user
    await ctx.db.insert("patientAlertAcknowledgements", {
      alertId: alert._id,
      userId: actor._id,
      acknowledgedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "alert.acknowledged",
      entityType: "patientAlerts",
      entityId: alert._id,
    });
  },
});

/**
 * Chart-header alerts: in force now and readable by this viewer. Archived
 * and expired alerts are excluded here but retained (see listHistory).
 */
export const listActive = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "patient.read");
    const now = Date.now();
    const alerts = await ctx.db
      .query("patientAlerts")
      .withIndex("by_patient_status", (q) =>
        q.eq("patientId", args.patientId).eq("status", "active"),
      )
      .collect();
    return await Promise.all(
      alerts
        .filter((alert) => isInForce(alert, now) && canRead(actor, alert))
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(async (alert) => ({
          ...alert,
          acknowledged:
            (await ctx.db
              .query("patientAlertAcknowledgements")
              .withIndex("by_alert_user", (q) =>
                q.eq("alertId", alert._id).eq("userId", actor._id),
              )
              .unique()) !== null,
        })),
    );
  },
});

/** Complete alert history for a chart, including archived and expired. */
export const listHistory = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "patient.read");
    const alerts = [
      ...(await ctx.db
        .query("patientAlerts")
        .withIndex("by_patient_status", (q) =>
          q.eq("patientId", args.patientId).eq("status", "active"),
        )
        .collect()),
      ...(await ctx.db
        .query("patientAlerts")
        .withIndex("by_patient_status", (q) =>
          q.eq("patientId", args.patientId).eq("status", "archived"),
        )
        .collect()),
    ];
    return alerts
      .filter((alert) => canRead(actor, alert))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});
