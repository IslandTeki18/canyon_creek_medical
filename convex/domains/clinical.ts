import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { requireCapability, requireLinkedPatient } from "../lib/access";
import { writeAudit } from "../lib/audit";
import { isIsoDate } from "../lib/time";

const optionalDate = v.optional(v.string());
const reconciliationStatus = v.union(
  v.literal("pending"),
  v.literal("confirmed"),
  v.literal("rejected"),
);
const diagnosisStatus = v.union(
  v.literal("active"),
  v.literal("resolved"),
  v.literal("enteredInError"),
);
const actionKind = v.union(
  v.literal("medication"),
  v.literal("referral"),
  v.literal("lifestyle"),
  v.literal("followUp"),
  v.literal("other"),
);

function requireText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  return trimmed;
}

function checkedDate(value: string | undefined, label: string) {
  if (value && !isIsoDate(value))
    throw new Error(`${label} must be YYYY-MM-DD`);
  return value;
}

export const listClinicalLists = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    await requireCapability(ctx, "clinical.manage");
    const [allergies, medications] = await Promise.all([
      ctx.db
        .query("allergies")
        .withIndex("by_patient_status", (q) => q.eq("patientId", patientId))
        .collect(),
      ctx.db
        .query("medications")
        .withIndex("by_patient_status", (q) => q.eq("patientId", patientId))
        .collect(),
    ]);
    return { allergies, medications };
  },
});

export const listReviewQueue = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "clinical.manage");
    const [allergies, medications] = await Promise.all([
      ctx.db
        .query("allergies")
        .withIndex("by_reconciliation", (q) =>
          q.eq("reconciliationStatus", "pending"),
        )
        .collect(),
      ctx.db
        .query("medications")
        .withIndex("by_reconciliation", (q) =>
          q.eq("reconciliationStatus", "pending"),
        )
        .collect(),
    ]);
    return { allergies, medications };
  },
});

export const listMyClinicalLists = query({
  args: {},
  handler: async (ctx) => {
    const { patient } = await requireLinkedPatient(ctx);
    const [allergies, medications] = await Promise.all([
      ctx.db
        .query("allergies")
        .withIndex("by_patient_status", (q) => q.eq("patientId", patient._id))
        .collect(),
      ctx.db
        .query("medications")
        .withIndex("by_patient_status", (q) => q.eq("patientId", patient._id))
        .collect(),
    ]);
    return {
      allergies: allergies.filter(
        (item) =>
          item.reconciliationStatus !== "rejected" &&
          (item.reconciliationStatus === "confirmed" || item.patientReported),
      ),
      medications: medications.filter(
        (item) =>
          item.reconciliationStatus !== "rejected" &&
          (item.reconciliationStatus === "confirmed" || item.patientReported),
      ),
    };
  },
});

export const recordMyHealthRecordAccess = mutation({
  args: {},
  handler: async (ctx) => {
    const { user, patient } = await requireLinkedPatient(ctx);
    await writeAudit(ctx, {
      actor: user,
      action: "portal.health_record.viewed",
      entityType: "patients",
      entityId: patient._id,
    });
  },
});

export const createAllergy = mutation({
  args: {
    patientId: v.id("patients"),
    allergen: v.string(),
    reaction: v.optional(v.string()),
    severity: v.optional(
      v.union(v.literal("mild"), v.literal("moderate"), v.literal("severe")),
    ),
    onsetDate: optionalDate,
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const now = Date.now();
    const allergyId = await ctx.db.insert("allergies", {
      patientId: args.patientId,
      allergen: requireText(args.allergen, "Allergen"),
      reaction: args.reaction?.trim(),
      severity: args.severity,
      status: "active",
      onsetDate: checkedDate(args.onsetDate, "Onset date"),
      source: "clinician",
      patientReported: false,
      reconciliationStatus: "confirmed",
      authorUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "allergy.created",
      entityType: "allergies",
      entityId: allergyId,
    });
    return allergyId;
  },
});

export const reportMyAllergy = mutation({
  args: {
    allergen: v.string(),
    reaction: v.optional(v.string()),
    severity: v.optional(
      v.union(v.literal("mild"), v.literal("moderate"), v.literal("severe")),
    ),
  },
  handler: async (ctx, args) => {
    const { user, patient } = await requireLinkedPatient(ctx);
    const now = Date.now();
    const allergyId = await ctx.db.insert("allergies", {
      patientId: patient._id,
      allergen: requireText(args.allergen, "Allergen"),
      reaction: args.reaction?.trim(),
      severity: args.severity,
      status: "active",
      source: "patient",
      patientReported: true,
      reconciliationStatus: "pending",
      authorUserId: user._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor: user,
      action: "allergy.patient_reported",
      entityType: "allergies",
      entityId: allergyId,
    });
    return allergyId;
  },
});

export const createMedication = mutation({
  args: {
    patientId: v.id("patients"),
    name: v.string(),
    dose: v.optional(v.string()),
    route: v.optional(v.string()),
    frequency: v.optional(v.string()),
    indication: v.optional(v.string()),
    startDate: optionalDate,
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const now = Date.now();
    const medicationId = await ctx.db.insert("medications", {
      patientId: args.patientId,
      name: requireText(args.name, "Medication name"),
      dose: args.dose?.trim(),
      route: args.route?.trim(),
      frequency: args.frequency?.trim(),
      indication: args.indication?.trim(),
      status: "active",
      startDate: checkedDate(args.startDate, "Start date"),
      source: "clinician",
      patientReported: false,
      reconciliationStatus: "confirmed",
      authorUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "medication.created",
      entityType: "medications",
      entityId: medicationId,
    });
    return medicationId;
  },
});

export const reportMyMedication = mutation({
  args: {
    name: v.string(),
    dose: v.optional(v.string()),
    route: v.optional(v.string()),
    frequency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, patient } = await requireLinkedPatient(ctx);
    const now = Date.now();
    const medicationId = await ctx.db.insert("medications", {
      patientId: patient._id,
      name: requireText(args.name, "Medication name"),
      dose: args.dose?.trim(),
      route: args.route?.trim(),
      frequency: args.frequency?.trim(),
      status: "active",
      source: "patient",
      patientReported: true,
      reconciliationStatus: "pending",
      authorUserId: user._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor: user,
      action: "medication.patient_reported",
      entityType: "medications",
      entityId: medicationId,
    });
    return medicationId;
  },
});

export const reconcileAllergy = mutation({
  args: {
    allergyId: v.id("allergies"),
    status: reconciliationStatus,
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const allergy = await ctx.db.get(args.allergyId);
    if (!allergy) throw new Error("Allergy not found");
    const reason = requireText(args.reason, "Reason");
    await ctx.db.patch(args.allergyId, {
      reconciliationStatus: args.status,
      statusReason: reason,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: `allergy.${args.status}`,
      entityType: "allergies",
      entityId: args.allergyId,
      reason,
    });
  },
});

export const reconcileMedication = mutation({
  args: {
    medicationId: v.id("medications"),
    status: reconciliationStatus,
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const medication = await ctx.db.get(args.medicationId);
    if (!medication) throw new Error("Medication not found");
    const reason = requireText(args.reason, "Reason");
    await ctx.db.patch(args.medicationId, {
      reconciliationStatus: args.status,
      statusReason: reason,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: `medication.${args.status}`,
      entityType: "medications",
      entityId: args.medicationId,
      reason,
    });
  },
});

export const setAllergyStatus = mutation({
  args: {
    allergyId: v.id("allergies"),
    status: v.union(v.literal("active"), v.literal("inactive")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const allergy = await ctx.db.get(args.allergyId);
    if (!allergy) throw new Error("Allergy not found");
    const reason = requireText(args.reason, "Reason");
    await ctx.db.patch(args.allergyId, {
      status: args.status,
      statusReason: reason,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "allergy.status_changed",
      entityType: "allergies",
      entityId: args.allergyId,
      reason,
    });
  },
});

export const setMedicationStatus = mutation({
  args: {
    medicationId: v.id("medications"),
    status: v.union(v.literal("active"), v.literal("inactive")),
    endDate: optionalDate,
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const medication = await ctx.db.get(args.medicationId);
    if (!medication) throw new Error("Medication not found");
    const reason = requireText(args.reason, "Reason");
    await ctx.db.patch(args.medicationId, {
      status: args.status,
      endDate: checkedDate(args.endDate, "End date"),
      statusReason: reason,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "medication.status_changed",
      entityType: "medications",
      entityId: args.medicationId,
      reason,
    });
  },
});

// Temporary configured catalog; replace with the approved terminology source
// when the practice selects one.
const DIAGNOSIS_CATALOG = [
  {
    codingSystem: "ICD-10-CM",
    code: "F32.9",
    display: "Depressive disorder, unspecified",
  },
  {
    codingSystem: "ICD-10-CM",
    code: "F41.9",
    display: "Anxiety disorder, unspecified",
  },
  {
    codingSystem: "ICD-10-CM",
    code: "F90.9",
    display: "Attention-deficit hyperactivity disorder, unspecified",
  },
] as const;

export const searchDiagnosisCatalog = query({
  args: { search: v.string() },
  handler: async (ctx, { search }) => {
    await requireCapability(ctx, "encounter.write");
    const normalized = search.trim().toLowerCase();
    return DIAGNOSIS_CATALOG.filter((item) =>
      `${item.code} ${item.display}`.toLowerCase().includes(normalized),
    );
  },
});

export const listDiagnoses = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    await requireCapability(ctx, "encounter.read");
    const diagnoses = await ctx.db
      .query("diagnoses")
      .withIndex("by_patient_status", (q) => q.eq("patientId", patientId))
      .collect();
    return await Promise.all(
      diagnoses.map(async (diagnosis) => ({
        ...diagnosis,
        events: await ctx.db
          .query("diagnosisEvents")
          .withIndex("by_diagnosis", (q) => q.eq("diagnosisId", diagnosis._id))
          .collect(),
      })),
    );
  },
});

export const createDiagnosis = mutation({
  args: {
    patientId: v.id("patients"),
    codingSystem: v.string(),
    code: v.string(),
    display: v.string(),
    onsetDate: optionalDate,
    encounterId: v.optional(v.id("encounters")),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "encounter.write");
    const catalogMatch = DIAGNOSIS_CATALOG.some(
      (item) =>
        item.codingSystem === args.codingSystem &&
        item.code === args.code &&
        item.display === args.display,
    );
    if (!catalogMatch)
      throw new Error("Select a diagnosis from the approved catalog");
    const now = Date.now();
    const diagnosisId = await ctx.db.insert("diagnoses", {
      patientId: args.patientId,
      codingSystem: args.codingSystem,
      code: args.code,
      display: args.display,
      status: "active",
      onsetDate: checkedDate(args.onsetDate, "Onset date"),
      authorUserId: actor._id,
      encounterId: args.encounterId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("diagnosisEvents", {
      diagnosisId,
      toStatus: "active",
      reason: "Created by clinician",
      actorUserId: actor._id,
      createdAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "diagnosis.created",
      entityType: "diagnoses",
      entityId: diagnosisId,
    });
    return diagnosisId;
  },
});

export const setDiagnosisStatus = mutation({
  args: {
    diagnosisId: v.id("diagnoses"),
    status: diagnosisStatus,
    resolutionDate: optionalDate,
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "encounter.write");
    const diagnosis = await ctx.db.get(args.diagnosisId);
    if (!diagnosis) throw new Error("Diagnosis not found");
    const reason = requireText(args.reason, "Reason");
    const now = Date.now();
    await ctx.db.patch(args.diagnosisId, {
      status: args.status,
      resolutionDate: checkedDate(args.resolutionDate, "Resolution date"),
      updatedAt: now,
    });
    await ctx.db.insert("diagnosisEvents", {
      diagnosisId: args.diagnosisId,
      fromStatus: diagnosis.status,
      toStatus: args.status,
      reason,
      actorUserId: actor._id,
      createdAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "diagnosis.status_changed",
      entityType: "diagnoses",
      entityId: args.diagnosisId,
      reason,
    });
  },
});

const goal = v.object({ text: v.string(), patientVisible: v.boolean() });
const planAction = v.object({
  text: v.string(),
  kind: actionKind,
  linkedMedicationId: v.optional(v.id("medications")),
  patientVisible: v.boolean(),
});

export const listTreatmentPlans = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    await requireCapability(ctx, "encounter.read");
    const plans = await ctx.db
      .query("treatmentPlans")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .collect();
    return await Promise.all(
      plans.map(async (plan) => {
        const versions = await ctx.db
          .query("treatmentPlanVersions")
          .withIndex("by_plan", (q) => q.eq("planId", plan._id))
          .order("desc")
          .collect();
        return {
          ...plan,
          versions: await Promise.all(
            versions.map(async (version) => ({
              ...version,
              goals: await ctx.db
                .query("planGoals")
                .withIndex("by_version", (q) => q.eq("versionId", version._id))
                .collect(),
              actions: await ctx.db
                .query("planActions")
                .withIndex("by_version", (q) => q.eq("versionId", version._id))
                .collect(),
            })),
          ),
        };
      }),
    );
  },
});

async function insertPlanItems(
  ctx: Parameters<typeof writeAudit>[0],
  versionId: Id<"treatmentPlanVersions">,
  goals: Array<{ text: string; patientVisible: boolean }>,
  actions: Array<{
    text: string;
    kind: "medication" | "referral" | "lifestyle" | "followUp" | "other";
    linkedMedicationId?: Id<"medications">;
    patientVisible: boolean;
  }>,
) {
  for (const item of goals) {
    await ctx.db.insert("planGoals", {
      versionId,
      text: requireText(item.text, "Goal"),
      patientVisible: item.patientVisible,
      createdAt: Date.now(),
    });
  }
  for (const item of actions) {
    await ctx.db.insert("planActions", {
      versionId,
      text: requireText(item.text, "Action"),
      kind: item.kind,
      linkedMedicationId: item.linkedMedicationId,
      patientVisible: item.patientVisible,
      createdAt: Date.now(),
    });
  }
}

export const createTreatmentPlan = mutation({
  args: {
    patientId: v.id("patients"),
    title: v.string(),
    followUp: v.optional(v.string()),
    goals: v.array(goal),
    actions: v.array(planAction),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "encounter.write");
    const now = Date.now();
    const planId = await ctx.db.insert("treatmentPlans", {
      patientId: args.patientId,
      title: requireText(args.title, "Title"),
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    const versionId = await ctx.db.insert("treatmentPlanVersions", {
      planId,
      version: 1,
      status: "draft",
      followUp: args.followUp?.trim(),
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await insertPlanItems(ctx, versionId, args.goals, args.actions);
    await writeAudit(ctx, {
      actor,
      action: "treatment_plan.created",
      entityType: "treatmentPlans",
      entityId: planId,
    });
    return planId;
  },
});

export const activateTreatmentPlan = mutation({
  args: { versionId: v.id("treatmentPlanVersions") },
  handler: async (ctx, { versionId }) => {
    const actor = await requireCapability(ctx, "encounter.write");
    const version = await ctx.db.get(versionId);
    if (!version || version.status !== "draft") {
      throw new Error("Only a draft plan can be activated");
    }
    const now = Date.now();
    const current = await ctx.db
      .query("treatmentPlanVersions")
      .withIndex("by_plan_status", (q) =>
        q.eq("planId", version.planId).eq("status", "active"),
      )
      .unique();
    if (current) {
      await ctx.db.patch(current._id, { status: "superseded", updatedAt: now });
    }
    await ctx.db.patch(versionId, {
      status: "active",
      activatedAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "treatment_plan.activated",
      entityType: "treatmentPlanVersions",
      entityId: versionId,
    });
  },
});

export const reviseTreatmentPlan = mutation({
  args: {
    planId: v.id("treatmentPlans"),
    followUp: v.optional(v.string()),
    goals: v.array(goal),
    actions: v.array(planAction),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "encounter.write");
    const latest = await ctx.db
      .query("treatmentPlanVersions")
      .withIndex("by_plan", (q) => q.eq("planId", args.planId))
      .order("desc")
      .first();
    if (!latest) throw new Error("Treatment plan not found");
    if (latest.status === "draft") throw new Error("A draft already exists");
    const now = Date.now();
    const versionId = await ctx.db.insert("treatmentPlanVersions", {
      planId: args.planId,
      version: latest.version + 1,
      status: "draft",
      followUp: args.followUp?.trim(),
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await insertPlanItems(ctx, versionId, args.goals, args.actions);
    return versionId;
  },
});

export const listMyTreatmentPlans = query({
  args: {},
  handler: async (ctx) => {
    const { patient } = await requireLinkedPatient(ctx);
    const plans = await ctx.db
      .query("treatmentPlans")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
      .collect();
    const visible = [];
    for (const plan of plans) {
      const version = await ctx.db
        .query("treatmentPlanVersions")
        .withIndex("by_plan_status", (q) =>
          q.eq("planId", plan._id).eq("status", "active"),
        )
        .unique();
      if (!version) continue;
      const [goals, actions] = await Promise.all([
        ctx.db
          .query("planGoals")
          .withIndex("by_version", (q) => q.eq("versionId", version._id))
          .collect(),
        ctx.db
          .query("planActions")
          .withIndex("by_version", (q) => q.eq("versionId", version._id))
          .collect(),
      ]);
      visible.push({
        title: plan.title,
        followUp: version.followUp,
        goals: goals.filter((item) => item.patientVisible),
        actions: actions.filter((item) => item.patientVisible),
      });
    }
    return visible;
  },
});
