import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { requireCapability } from "../lib/access";
import { writeAudit } from "../lib/audit";
import { publishedVersion } from "./forms";

// Form assignment engine: rules decide which templates a patient owes;
// assignments are generated idempotently (one per patient+template).

export const listRules = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "form.manage");
    const rules = await ctx.db.query("formAssignmentRules").collect();
    const withNames = [];
    for (const rule of rules) {
      const template = await ctx.db.get(rule.templateId);
      withNames.push({ ...rule, templateName: template?.name ?? "(deleted)" });
    }
    return withNames;
  },
});

export const createRule = mutation({
  args: {
    templateId: v.id("formTemplates"),
    audience: v.union(
      v.literal("all"),
      v.literal("new"),
      v.literal("returning"),
    ),
    effectiveAt: v.optional(v.number()),
    // Scoping keys (12.1): the engine has always honored these; the
    // administration workspace is what finally sets them.
    serviceKey: v.optional(v.string()),
    appointmentType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "form.manage");
    const template = await ctx.db.get(args.templateId);
    if (!template || template.status !== "active") {
      throw new Error("Template not found or retired");
    }
    if (args.serviceKey !== undefined) {
      const service = await ctx.db
        .query("services")
        .withIndex("by_key", (q) => q.eq("key", args.serviceKey!))
        .unique();
      if (!service) throw new Error("Unknown service key");
    }
    if (args.appointmentType !== undefined) {
      const type = await ctx.db
        .query("appointmentTypes")
        .withIndex("by_key", (q) => q.eq("key", args.appointmentType!))
        .unique();
      if (!type) throw new Error("Unknown appointment type key");
    }
    const now = Date.now();
    const ruleId = await ctx.db.insert("formAssignmentRules", {
      templateId: args.templateId,
      audience: args.audience,
      serviceKey: args.serviceKey,
      appointmentType: args.appointmentType,
      effectiveAt: args.effectiveAt ?? now,
      active: true,
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "form.rule.created",
      entityType: "formAssignmentRules",
      entityId: ruleId,
    });
    return ruleId;
  },
});

export const setRuleActive = mutation({
  args: { ruleId: v.id("formAssignmentRules"), active: v.boolean() },
  handler: async (ctx, { ruleId, active }) => {
    const actor = await requireCapability(ctx, "form.manage");
    const rule = await ctx.db.get(ruleId);
    if (!rule) throw new Error("Rule not found");
    if (rule.active !== active) {
      await ctx.db.patch(ruleId, { active, updatedAt: Date.now() });
    }
    await writeAudit(ctx, {
      actor,
      action: active ? "form.rule.activated" : "form.rule.deactivated",
      entityType: "formAssignmentRules",
      entityId: ruleId,
    });
  },
});

async function assignmentExists(
  ctx: QueryCtx,
  patientId: Id<"patients">,
  templateId: Id<"formTemplates">,
): Promise<boolean> {
  const existing = await ctx.db
    .query("formAssignments")
    .withIndex("by_patient_template", (q) =>
      q.eq("patientId", patientId).eq("templateId", templateId),
    )
    .first();
  return existing !== null;
}

/** Whether the patient has completed an appointment before. Rules targeting
 * new vs returning patients read this; without history everyone is new. */
async function isReturningPatient(
  ctx: QueryCtx,
  patientId: Id<"patients">,
): Promise<boolean> {
  const history = await ctx.db
    .query("appointments")
    .withIndex("by_patient_start", (q) => q.eq("patientId", patientId))
    .collect();
  return history.some((a) => a.status === "completed");
}

/**
 * Materializes rule-based assignments for one patient. Idempotent: running
 * twice never duplicates. Skips retired templates and templates without a
 * published version. Rules scoped to a service or appointment type apply
 * only when booking that type; unscoped rules always apply.
 *
 * Shared by the staff "run rules" action and by appointment booking (5.4).
 */
export async function materializeAssignments(
  ctx: MutationCtx,
  args: {
    actor: Doc<"users">;
    patientId: Id<"patients">;
    serviceKey?: string;
    appointmentTypeKey?: string;
  },
): Promise<{ created: number }> {
  const rules = await ctx.db
    .query("formAssignmentRules")
    .withIndex("by_active", (q) => q.eq("active", true))
    .collect();
  const now = Date.now();
  const returning = await isReturningPatient(ctx, args.patientId);
  let created = 0;
  for (const rule of rules) {
    if (rule.effectiveAt > now) continue;
    if (rule.audience === "new" && returning) continue;
    if (rule.audience === "returning" && !returning) continue;
    if (rule.serviceKey !== undefined && rule.serviceKey !== args.serviceKey) {
      continue;
    }
    if (
      rule.appointmentType !== undefined &&
      rule.appointmentType !== args.appointmentTypeKey
    ) {
      continue;
    }
    const template = await ctx.db.get(rule.templateId);
    if (!template || template.status !== "active") continue;
    if (!(await publishedVersion(ctx, rule.templateId))) continue;
    if (await assignmentExists(ctx, args.patientId, rule.templateId)) continue;
    const assignmentId = await ctx.db.insert("formAssignments", {
      patientId: args.patientId,
      templateId: rule.templateId,
      ruleId: rule._id,
      source: "rule",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor: args.actor,
      action: "form.assignment.created",
      entityType: "formAssignments",
      entityId: assignmentId,
    });
    created += 1;
  }
  return { created };
}

export const runForPatient = mutation({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    const actor = await requireCapability(ctx, "patient.manage");
    const patient = await ctx.db.get(patientId);
    if (!patient || patient.status !== "active") {
      throw new Error("Patient not found or archived");
    }
    return await materializeAssignments(ctx, { actor, patientId });
  },
});

export const assignManually = mutation({
  args: {
    patientId: v.id("patients"),
    templateId: v.id("formTemplates"),
    reason: v.string(),
  },
  handler: async (ctx, { patientId, templateId, reason }) => {
    const actor = await requireCapability(ctx, "patient.manage");
    if (!reason.trim()) throw new Error("A reason is required");
    const template = await ctx.db.get(templateId);
    if (!template || template.status !== "active") {
      throw new Error("Template not found or retired");
    }
    if (!(await publishedVersion(ctx, templateId))) {
      throw new Error("Template has no published version");
    }
    if (await assignmentExists(ctx, patientId, templateId)) {
      throw new Error("This form is already assigned");
    }
    const now = Date.now();
    const assignmentId = await ctx.db.insert("formAssignments", {
      patientId,
      templateId,
      source: "manual",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "form.assignment.created_manually",
      entityType: "formAssignments",
      entityId: assignmentId,
      reason,
    });
    return assignmentId;
  },
});

export const waiveAssignment = mutation({
  args: { assignmentId: v.id("formAssignments"), reason: v.string() },
  handler: async (ctx, { assignmentId, reason }) => {
    const actor = await requireCapability(ctx, "patient.manage");
    if (!reason.trim()) throw new Error("A reason is required");
    const assignment = await ctx.db.get(assignmentId);
    if (!assignment || assignment.status !== "pending") {
      throw new Error("Assignment is not pending");
    }
    await ctx.db.patch(assignmentId, {
      status: "waived",
      waiveReason: reason,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "form.assignment.waived",
      entityType: "formAssignments",
      entityId: assignmentId,
      reason,
    });
  },
});

export type AssignmentState = "pending" | "completed" | "waived";

/**
 * Completion is derived, never stored: a submitted response (intake) or a
 * consent signed for the current published version (consent) completes the
 * assignment. Shared by staff and patient views and by readiness (4.6).
 */
export async function resolveAssignmentState(
  ctx: QueryCtx,
  assignment: Doc<"formAssignments">,
  template: Doc<"formTemplates">,
): Promise<AssignmentState> {
  if (assignment.status === "waived") return "waived";
  if (template.type === "consent") {
    const published = await publishedVersion(ctx, template._id);
    if (!published) return "pending";
    const signed = await ctx.db
      .query("consentRecords")
      .withIndex("by_patient_version", (q) =>
        q.eq("patientId", assignment.patientId).eq("versionId", published._id),
      )
      .unique();
    return signed ? "completed" : "pending";
  }
  const responses = await ctx.db
    .query("formResponses")
    .withIndex("by_patient_template", (q) =>
      q
        .eq("patientId", assignment.patientId)
        .eq("templateId", assignment.templateId),
    )
    .collect();
  return responses.some((r) => r.status === "submitted")
    ? "completed"
    : "pending";
}

export async function assignmentsWithState(
  ctx: QueryCtx,
  patientId: Id<"patients">,
) {
  const assignments = await ctx.db
    .query("formAssignments")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .collect();
  const result = [];
  for (const assignment of assignments) {
    const template = await ctx.db.get(assignment.templateId);
    if (!template) continue;
    result.push({
      _id: assignment._id,
      templateId: assignment.templateId,
      templateName: template.name,
      templateType: template.type,
      templateRetired: template.status === "retired",
      source: assignment.source,
      waiveReason: assignment.waiveReason,
      state: await resolveAssignmentState(ctx, assignment, template),
    });
  }
  return result;
}

/** Staff view of a patient's intake assignments. */
export const listForPatient = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    await requireCapability(ctx, "patient.read");
    return await assignmentsWithState(ctx, patientId);
  },
});
