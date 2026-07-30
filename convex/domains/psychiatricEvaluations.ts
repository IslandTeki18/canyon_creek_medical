import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireCapability } from "../lib/access";
import { writeAudit } from "../lib/audit";

export const EVALUATION_SECTIONS = [
  "presentingConcern",
  "psychiatricHistory",
  "medicalHistory",
  "familyHistory",
  "medicationHistory",
  "substanceUse",
  "sleep",
  "lifestyle",
  "trauma",
  "mentalStatus",
  "riskAssessment",
  "formulation",
  "plan",
] as const;

const sectionValues = v.record(v.string(), v.string());

export const createConfig = mutation({
  args: {
    name: v.string(),
    requiredSections: v.array(v.string()),
    optionalSections: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "form.manage");
    const allowed = new Set<string>(EVALUATION_SECTIONS);
    const all = [...args.requiredSections, ...args.optionalSections];
    if (
      !args.name.trim() ||
      all.length !== EVALUATION_SECTIONS.length ||
      new Set(all).size !== EVALUATION_SECTIONS.length ||
      all.some((section) => !allowed.has(section))
    ) {
      throw new Error("Configuration must classify every evaluation section");
    }
    const now = Date.now();
    return await ctx.db.insert("psychiatricEvaluationConfigs", {
      name: args.name.trim(),
      requiredSections: args.requiredSections,
      optionalSections: args.optionalSections,
      status: "active",
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listActiveConfigs = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "encounter.write");
    return await ctx.db
      .query("psychiatricEvaluationConfigs")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
  },
});

export const getForEncounter = query({
  args: { encounterId: v.id("encounters") },
  handler: async (ctx, { encounterId }) => {
    await requireCapability(ctx, "encounter.read");
    const evaluation = await ctx.db
      .query("psychiatricEvaluations")
      .withIndex("by_encounter", (q) => q.eq("encounterId", encounterId))
      .unique();
    if (!evaluation) return null;
    return {
      evaluation,
      config: await ctx.db.get(evaluation.configId),
    };
  },
});

export const save = mutation({
  args: {
    encounterId: v.id("encounters"),
    configId: v.id("psychiatricEvaluationConfigs"),
    expectedRevision: v.number(),
    sections: sectionValues,
    patientReportedSections: v.array(v.string()),
    medicationIds: v.array(v.id("medications")),
    diagnosisIds: v.array(v.id("diagnoses")),
    assessmentResponseIds: v.array(v.id("formResponses")),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "encounter.write");
    const encounter = await ctx.db.get(args.encounterId);
    const config = await ctx.db.get(args.configId);
    if (!encounter || encounter.status !== "draft" || !config) {
      throw new Error("Draft encounter or evaluation configuration not found");
    }
    const provider = await ctx.db
      .query("providers")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .unique();
    if (!provider || provider._id !== encounter.providerId) {
      throw new Error("Only the assigned provider may edit this evaluation");
    }
    const allowed = new Set<string>(EVALUATION_SECTIONS);
    if (
      Object.keys(args.sections).some((key) => !allowed.has(key)) ||
      args.patientReportedSections.some((key) => !allowed.has(key))
    ) {
      throw new Error("Unknown evaluation section");
    }
    if (
      Object.values(args.sections).some(
        (value) => typeof value !== "string" || value.length > 50_000,
      )
    ) {
      throw new Error("Invalid evaluation section");
    }
    for (const id of args.medicationIds) {
      if ((await ctx.db.get(id))?.patientId !== encounter.patientId) {
        throw new Error("Referenced medication does not belong to the patient");
      }
    }
    for (const id of args.diagnosisIds) {
      if ((await ctx.db.get(id))?.patientId !== encounter.patientId) {
        throw new Error("Referenced diagnosis does not belong to the patient");
      }
    }
    for (const id of args.assessmentResponseIds) {
      const response = await ctx.db.get(id);
      if (
        response?.patientId !== encounter.patientId ||
        !response.assessmentVersionId
      ) {
        throw new Error("Referenced assessment does not belong to the patient");
      }
    }
    const existing = await ctx.db
      .query("psychiatricEvaluations")
      .withIndex("by_encounter", (q) => q.eq("encounterId", args.encounterId))
      .unique();
    if (existing?.status === "signed") {
      throw new Error("Signed evaluations cannot be edited");
    }
    if ((existing?.revision ?? 0) !== args.expectedRevision) {
      throw new Error("This evaluation changed in another session");
    }
    const now = Date.now();
    const values = {
      configId: args.configId,
      sections: args.sections,
      patientReportedSections: args.patientReportedSections,
      medicationIds: args.medicationIds,
      diagnosisIds: args.diagnosisIds,
      assessmentResponseIds: args.assessmentResponseIds,
      revision: args.expectedRevision + 1,
      updatedByUserId: actor._id,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, values);
      return existing._id;
    }
    const id = await ctx.db.insert("psychiatricEvaluations", {
      encounterId: args.encounterId,
      status: "draft",
      ...values,
      createdAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "psychiatric_evaluation.created",
      entityType: "psychiatricEvaluations",
      entityId: id,
    });
    return id;
  },
});
