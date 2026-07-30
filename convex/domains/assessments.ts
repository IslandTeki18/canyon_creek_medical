import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mutation, query, type MutationCtx } from "../_generated/server";
import { requireCapability } from "../lib/access";
import {
  scoreAssessment,
  validateAssessmentScoring,
  type AssessmentScoring,
} from "../lib/assessments";
import { writeAudit } from "../lib/audit";
import { parseDefinition, type Answers } from "../lib/forms";
import { isIsoDate } from "../lib/time";

const scoringValidator = v.object({
  fields: v.array(v.object({ key: v.string(), weight: v.number() })),
  interpretations: v.array(
    v.object({ min: v.number(), max: v.number(), label: v.string() }),
  ),
});
const responseRuleValidator = v.object({
  fieldKey: v.string(),
  equals: v.union(v.string(), v.number(), v.boolean()),
  instructions: v.string(),
});

function text(value: string, label: string) {
  const result = value.trim();
  if (!result) throw new Error(`${label} is required`);
  return result;
}

export const createDefinition = mutation({
  args: {
    name: v.string(),
    key: v.string(),
    licensing: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "form.manage");
    const key = text(args.key, "Key").toLowerCase();
    if (!/^[a-z0-9-]{1,40}$/.test(key)) throw new Error("Invalid key");
    if (
      await ctx.db
        .query("assessmentDefinitions")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique()
    ) {
      throw new Error("Assessment key already exists");
    }
    const now = Date.now();
    const definitionId = await ctx.db.insert("assessmentDefinitions", {
      name: text(args.name, "Name"),
      key,
      licensing: text(args.licensing, "Licensing metadata"),
      status: "active",
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    const templateId = await ctx.db.insert("formTemplates", {
      name: text(args.name, "Name"),
      type: "assessment",
      status: "active",
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "assessment.definition.created",
      entityType: "assessmentDefinitions",
      entityId: definitionId,
    });
    return { definitionId, templateId };
  },
});

export const createDraftVersion = mutation({
  args: {
    definitionId: v.id("assessmentDefinitions"),
    templateId: v.id("formTemplates"),
    formDefinition: v.any(),
    scoring: scoringValidator,
    responseRules: v.array(responseRuleValidator),
    effectiveFrom: v.string(),
    effectiveTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "form.manage");
    const instrument = await ctx.db.get(args.definitionId);
    const template = await ctx.db.get(args.templateId);
    if (!instrument || !template || template.type !== "assessment") {
      throw new Error("Assessment not found");
    }
    if (
      !isIsoDate(args.effectiveFrom) ||
      (args.effectiveTo && !isIsoDate(args.effectiveTo))
    ) {
      throw new Error("Effective dates must be YYYY-MM-DD");
    }
    const definition = parseDefinition(args.formDefinition);
    const scoring = validateAssessmentScoring(
      definition,
      args.scoring as AssessmentScoring,
    );
    const fields = new Set(
      definition.sections.flatMap((section) =>
        section.fields.map((field) => field.key),
      ),
    );
    for (const rule of args.responseRules) {
      if (!fields.has(rule.fieldKey) || !rule.instructions.trim()) {
        throw new Error(
          "Response rules must reference a field and instructions",
        );
      }
    }
    const previous = await ctx.db
      .query("assessmentVersions")
      .withIndex("by_definition", (q) =>
        q.eq("assessmentDefinitionId", args.definitionId),
      )
      .order("desc")
      .first();
    if (previous?.status === "draft") throw new Error("A draft already exists");
    const now = Date.now();
    const formVersionId = await ctx.db.insert("formVersions", {
      templateId: args.templateId,
      version: (previous?.version ?? 0) + 1,
      status: "draft",
      definition,
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.insert("assessmentVersions", {
      assessmentDefinitionId: args.definitionId,
      formVersionId,
      version: (previous?.version ?? 0) + 1,
      status: "draft",
      scoring,
      responseRules: args.responseRules.map((rule) => ({
        ...rule,
        instructions: rule.instructions.trim(),
      })),
      effectiveFrom: args.effectiveFrom,
      effectiveTo: args.effectiveTo,
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const publishVersion = mutation({
  args: { versionId: v.id("assessmentVersions") },
  handler: async (ctx, { versionId }) => {
    const actor = await requireCapability(ctx, "form.manage");
    const version = await ctx.db.get(versionId);
    if (!version || version.status !== "draft") {
      throw new Error("Only draft assessment versions can be published");
    }
    const formVersion = await ctx.db.get(version.formVersionId);
    if (!formVersion || formVersion.status !== "draft") {
      throw new Error("Assessment form draft not found");
    }
    const current = await ctx.db
      .query("assessmentVersions")
      .withIndex("by_definition_status", (q) =>
        q
          .eq("assessmentDefinitionId", version.assessmentDefinitionId)
          .eq("status", "published"),
      )
      .unique();
    const now = Date.now();
    if (current) {
      await ctx.db.patch(current._id, { status: "superseded", updatedAt: now });
      await ctx.db.patch(current.formVersionId, {
        status: "superseded",
        updatedAt: now,
      });
    }
    await ctx.db.patch(versionId, {
      status: "published",
      publishedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(formVersion._id, {
      status: "published",
      publishedAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "assessment.version.published",
      entityType: "assessmentVersions",
      entityId: versionId,
    });
  },
});

async function publishedVersion(
  ctx: Parameters<typeof requireCapability>[0],
  definitionId: Doc<"assessmentDefinitions">["_id"],
) {
  return await ctx.db
    .query("assessmentVersions")
    .withIndex("by_definition_status", (q) =>
      q.eq("assessmentDefinitionId", definitionId).eq("status", "published"),
    )
    .unique();
}

export const assign = mutation({
  args: {
    patientId: v.id("patients"),
    definitionId: v.id("assessmentDefinitions"),
    appointmentId: v.optional(v.id("appointments")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    if (!(await publishedVersion(ctx, args.definitionId))) {
      throw new Error("Assessment has no published version");
    }
    if (!text(args.reason, "Reason")) throw new Error("Reason is required");
    const existing = await ctx.db
      .query("assessmentAssignments")
      .withIndex("by_patient_definition", (q) =>
        q
          .eq("patientId", args.patientId)
          .eq("assessmentDefinitionId", args.definitionId)
          .eq("status", "pending"),
      )
      .first();
    if (existing) return existing._id;
    const now = Date.now();
    const id = await ctx.db.insert("assessmentAssignments", {
      patientId: args.patientId,
      assessmentDefinitionId: args.definitionId,
      appointmentId: args.appointmentId,
      source: "manual",
      status: "pending",
      reason: args.reason.trim(),
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "assessment.assigned",
      entityType: "assessmentAssignments",
      entityId: id,
      reason: args.reason,
    });
    return id;
  },
});

export async function assignForAppointment(
  ctx: MutationCtx,
  args: {
    actor: Doc<"users">;
    patientId: Doc<"patients">["_id"];
    appointmentId: Doc<"appointments">["_id"];
    appointmentTypeId: Doc<"appointmentTypes">["_id"];
  },
) {
  const rules = await ctx.db
    .query("assessmentAppointmentRules")
    .withIndex("by_appointment_type", (q) =>
      q.eq("appointmentTypeId", args.appointmentTypeId).eq("active", true),
    )
    .collect();
  let created = 0;
  for (const rule of rules) {
    if (!(await publishedVersion(ctx, rule.assessmentDefinitionId))) continue;
    const pending = await ctx.db
      .query("assessmentAssignments")
      .withIndex("by_patient_definition", (q) =>
        q
          .eq("patientId", args.patientId)
          .eq("assessmentDefinitionId", rule.assessmentDefinitionId)
          .eq("status", "pending"),
      )
      .first();
    if (pending) continue;
    const now = Date.now();
    await ctx.db.insert("assessmentAssignments", {
      patientId: args.patientId,
      assessmentDefinitionId: rule.assessmentDefinitionId,
      appointmentId: args.appointmentId,
      source: "appointmentType",
      status: "pending",
      createdByUserId: args.actor._id,
      createdAt: now,
      updatedAt: now,
    });
    created += 1;
  }
  return created;
}

export const setAppointmentRule = mutation({
  args: {
    appointmentTypeId: v.id("appointmentTypes"),
    definitionId: v.id("assessmentDefinitions"),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "form.manage");
    const existing = (
      await ctx.db
        .query("assessmentAppointmentRules")
        .withIndex("by_appointment_type", (q) =>
          q.eq("appointmentTypeId", args.appointmentTypeId),
        )
        .collect()
    ).find((rule) => rule.assessmentDefinitionId === args.definitionId);
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        active: args.active,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("assessmentAppointmentRules", {
      appointmentTypeId: args.appointmentTypeId,
      assessmentDefinitionId: args.definitionId,
      active: args.active,
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listTrends = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    await requireCapability(ctx, "encounter.read");
    const responses = await ctx.db
      .query("formResponses")
      .withIndex("by_patient", (q) =>
        q.eq("patientId", patientId).eq("status", "submitted"),
      )
      .collect();
    const result = [];
    for (const response of responses) {
      if (!response.assessmentVersionId) continue;
      const version = await ctx.db.get(response.assessmentVersionId);
      if (!version) continue;
      const instrument = await ctx.db.get(version.assessmentDefinitionId);
      const scored = scoreAssessment(
        version.scoring as AssessmentScoring,
        response.answers as Answers,
      );
      result.push({
        responseId: response._id,
        completedAt: response.submittedAt!,
        score: response.score ?? scored.score,
        interpretation: scored.interpretation,
        instrumentName: instrument?.name ?? "Assessment",
        instrumentVersion: version.version,
      });
    }
    return result.sort((a, b) => a.completedAt - b.completedAt);
  },
});

export const getResponse = query({
  args: { responseId: v.id("formResponses") },
  handler: async (ctx, { responseId }) => {
    await requireCapability(ctx, "encounter.read");
    const response = await ctx.db.get(responseId);
    if (!response?.assessmentVersionId) return null;
    const version = await ctx.db.get(response.assessmentVersionId);
    const formVersion = version && (await ctx.db.get(version.formVersionId));
    if (!version || !formVersion) return null;
    return {
      response,
      definition: parseDefinition(formVersion.definition),
      version,
    };
  },
});

export const listReviewTasks = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "clinical.manage");
    return await ctx.db.query("clinicalReviewTasks").order("desc").collect();
  },
});

export const acknowledgeReviewTask = mutation({
  args: { taskId: v.id("clinicalReviewTasks") },
  handler: async (ctx, { taskId }) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const task = await ctx.db.get(taskId);
    if (!task || task.status !== "open") throw new Error("Task is not open");
    const now = Date.now();
    await ctx.db.patch(taskId, {
      status: "acknowledged",
      acknowledgedByUserId: actor._id,
      acknowledgedAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "assessment.review.acknowledged",
      entityType: "clinicalReviewTasks",
      entityId: taskId,
    });
  },
});

export const resolveReviewTask = mutation({
  args: { taskId: v.id("clinicalReviewTasks"), disposition: v.string() },
  handler: async (ctx, { taskId, disposition }) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const task = await ctx.db.get(taskId);
    if (!task || task.status === "resolved") {
      throw new Error("Task is already resolved");
    }
    const now = Date.now();
    await ctx.db.patch(taskId, {
      status: "resolved",
      disposition: text(disposition, "Disposition"),
      resolvedByUserId: actor._id,
      resolvedAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "assessment.review.resolved",
      entityType: "clinicalReviewTasks",
      entityId: taskId,
      reason: disposition,
    });
  },
});
