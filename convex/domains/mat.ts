// MAT operational workflow (Increment 9). Everything here is sensitive
// substance-use data: every public function requires "mat.access", and no
// content from these records is ever placed in notifications or general
// work queues. The software coordinates documentation only — treatment,
// medication, and eligibility decisions belong to clinicians.
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "../_generated/server";
import { requireCapability } from "../lib/access";
import { writeAudit } from "../lib/audit";
import { communicationIdempotencyKey } from "../lib/communications";
import { isSuppressed } from "./communications";

export type EpisodeState = Doc<"matEpisodes">["state"];

const EPISODE_TRANSITIONS: Record<EpisodeState, readonly EpisodeState[]> = {
  active: ["paused", "transferred", "completed", "archived"],
  paused: ["active", "transferred", "completed", "archived"],
  transferred: ["archived"],
  completed: ["archived"],
  archived: [],
};

function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A reason is required");
  return trimmed;
}

export const createEpisode = mutation({
  args: { patientId: v.id("patients"), providerId: v.id("providers") },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "mat.access");
    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.status !== "active") {
      throw new Error("Patient not found");
    }
    const provider = await ctx.db.get(args.providerId);
    if (!provider || provider.status !== "active") {
      throw new Error("Provider not found");
    }
    const existing = await ctx.db
      .query("matEpisodes")
      .withIndex("by_patient", (q) =>
        q.eq("patientId", args.patientId).eq("state", "active"),
      )
      .first();
    if (existing) throw new Error("Patient already has an active MAT episode");
    const now = Date.now();
    const episodeId = await ctx.db.insert("matEpisodes", {
      patientId: args.patientId,
      providerId: args.providerId,
      state: "active",
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "mat.episode.created",
      entityType: "matEpisodes",
      entityId: episodeId,
    });
    return episodeId;
  },
});

export const setEpisodeState = mutation({
  args: {
    episodeId: v.id("matEpisodes"),
    state: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("transferred"),
      v.literal("completed"),
      v.literal("archived"),
    ),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "mat.access");
    const episode = await ctx.db.get(args.episodeId);
    if (!episode) throw new Error("Episode not found");
    if (!EPISODE_TRANSITIONS[episode.state].includes(args.state)) {
      throw new Error(
        `Cannot move episode from ${episode.state} to ${args.state}`,
      );
    }
    const reason = requireReason(args.reason);
    await ctx.db.patch(episode._id, {
      state: args.state,
      stateReason: reason,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: `mat.episode.${args.state}`,
      entityType: "matEpisodes",
      entityId: episode._id,
      reason,
    });
  },
});

// --- 9.2 MAT intake and history --------------------------------------

export const MAT_INTAKE_KEYS = [
  "substanceUseHistory",
  "priorTreatment",
  "withdrawalHistory",
  "overdoseHistory",
  "recoverySupports",
  "patientGoals",
] as const;

const intakeFieldValidator = v.object({
  key: v.string(),
  value: v.string(),
  source: v.union(v.literal("patient"), v.literal("clinician")),
});

export const recordIntake = mutation({
  args: {
    episodeId: v.id("matEpisodes"),
    fields: v.array(intakeFieldValidator),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "mat.access");
    const episode = await ctx.db.get(args.episodeId);
    if (!episode || episode.state !== "active") {
      throw new Error("An active episode is required");
    }
    const known = new Set<string>(MAT_INTAKE_KEYS);
    for (const field of args.fields) {
      if (!known.has(field.key)) {
        throw new Error(`Unknown intake field: ${field.key}`);
      }
      if (field.value.length > 20_000) {
        throw new Error(`${field.key} is too long`);
      }
    }
    const now = Date.now();
    const assessmentId = await ctx.db.insert("matAssessments", {
      episodeId: episode._id,
      patientId: episode.patientId,
      // Clinician-entered fields start verified; patient-reported never do.
      fields: args.fields.map((field) => ({
        ...field,
        clinicianVerified: field.source === "clinician",
      })),
      reviewStatus: "pending",
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "mat.intake.recorded",
      entityType: "matAssessments",
      entityId: assessmentId,
    });
    return assessmentId;
  },
});

export const reviewIntake = mutation({
  args: {
    assessmentId: v.id("matAssessments"),
    verifiedKeys: v.array(v.string()),
    followUpQuestions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "encounter.sign");
    await requireCapability(ctx, "mat.access");
    const assessment = await ctx.db.get(args.assessmentId);
    if (!assessment) throw new Error("Assessment not found");
    if (assessment.reviewStatus === "reviewed") {
      throw new Error("Assessment is already reviewed");
    }
    const verified = new Set(args.verifiedKeys);
    const now = Date.now();
    await ctx.db.patch(assessment._id, {
      fields: assessment.fields.map((field) => ({
        ...field,
        clinicianVerified: field.clinicianVerified || verified.has(field.key),
      })),
      reviewStatus: "reviewed",
      followUpQuestions: args.followUpQuestions?.trim() || undefined,
      reviewedByUserId: actor._id,
      reviewedAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "mat.intake.reviewed",
      entityType: "matAssessments",
      entityId: assessment._id,
    });
  },
});

export const listIntakeForEpisode = query({
  args: { episodeId: v.id("matEpisodes") },
  handler: async (ctx, { episodeId }) => {
    await requireCapability(ctx, "mat.access");
    return await ctx.db
      .query("matAssessments")
      .withIndex("by_episode", (q) => q.eq("episodeId", episodeId))
      .collect();
  },
});

// --- 9.3 MAT follow-up encounter template -----------------------------

export const MAT_FOLLOW_UP_SECTIONS = [
  "response",
  "cravings",
  "withdrawal",
  "adherence",
  "adverseEffects",
  "substanceUse",
  "counselingCoordination",
  "monitoring",
  "risk",
  "plan",
  "followUp",
] as const;

const DEFAULT_REQUIRED_SECTIONS = ["response", "risk", "plan"];

function validateFollowUpSections(sections: unknown): Record<string, string> {
  if (typeof sections !== "object" || sections === null) {
    throw new Error("Sections are required");
  }
  const known = new Set<string>(MAT_FOLLOW_UP_SECTIONS);
  for (const [key, value] of Object.entries(sections)) {
    if (!known.has(key)) throw new Error(`Unknown section: ${key}`);
    if (typeof value !== "string" || value.length > 50_000) {
      throw new Error(`${key} is invalid`);
    }
  }
  return sections as Record<string, string>;
}

export const setFollowUpConfig = mutation({
  args: {
    appointmentTypeId: v.id("appointmentTypes"),
    requiredSections: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "config.manage");
    const known = new Set<string>(MAT_FOLLOW_UP_SECTIONS);
    for (const key of args.requiredSections) {
      if (!known.has(key)) throw new Error(`Unknown section: ${key}`);
    }
    if (!(await ctx.db.get(args.appointmentTypeId))) {
      throw new Error("Appointment type not found");
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("matFollowUpConfigs")
      .withIndex("by_appointment_type", (q) =>
        q.eq("appointmentTypeId", args.appointmentTypeId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        requiredSections: args.requiredSections,
        updatedByUserId: actor._id,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("matFollowUpConfigs", {
      appointmentTypeId: args.appointmentTypeId,
      requiredSections: args.requiredSections,
      updatedByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setMedicationPlan = mutation({
  args: {
    episodeId: v.id("matEpisodes"),
    medication: v.string(),
    dose: v.string(),
    frequency: v.string(),
    linkedMedicationId: v.optional(v.id("medications")),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "encounter.sign");
    await requireCapability(ctx, "mat.access");
    const episode = await ctx.db.get(args.episodeId);
    if (!episode || episode.state !== "active") {
      throw new Error("An active episode is required");
    }
    const now = Date.now();
    // Supersede, never edit: the prior plan row stays intact.
    const current = await ctx.db
      .query("matMedicationPlans")
      .withIndex("by_episode", (q) =>
        q.eq("episodeId", episode._id).eq("status", "active"),
      )
      .unique();
    if (current) {
      await ctx.db.patch(current._id, { status: "superseded", updatedAt: now });
    }
    const planId = await ctx.db.insert("matMedicationPlans", {
      episodeId: episode._id,
      medication: args.medication.trim(),
      dose: args.dose.trim(),
      frequency: args.frequency.trim(),
      status: "active",
      linkedMedicationId: args.linkedMedicationId,
      authorUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "mat.medication_plan.set",
      entityType: "matMedicationPlans",
      entityId: planId,
    });
    return planId;
  },
});

export const startFollowUp = mutation({
  args: { encounterId: v.id("encounters"), episodeId: v.id("matEpisodes") },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "mat.access");
    await requireCapability(ctx, "encounter.write");
    const encounter = await ctx.db.get(args.encounterId);
    if (!encounter || encounter.status !== "draft") {
      throw new Error("A draft encounter is required");
    }
    const episode = await ctx.db.get(args.episodeId);
    if (!episode || episode.state !== "active") {
      throw new Error("An active episode is required");
    }
    if (episode.patientId !== encounter.patientId) {
      throw new Error("Episode does not belong to this patient");
    }
    const existing = await ctx.db
      .query("matFollowUpNotes")
      .withIndex("by_encounter", (q) => q.eq("encounterId", args.encounterId))
      .unique();
    if (existing) return existing._id;
    const plan = await ctx.db
      .query("matMedicationPlans")
      .withIndex("by_episode", (q) =>
        q.eq("episodeId", episode._id).eq("status", "active"),
      )
      .unique();
    const now = Date.now();
    return await ctx.db.insert("matFollowUpNotes", {
      encounterId: encounter._id,
      episodeId: episode._id,
      medicationPlanId: plan?._id,
      sections: {},
      status: "draft",
      revision: 0,
      updatedByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const saveFollowUp = mutation({
  args: {
    noteId: v.id("matFollowUpNotes"),
    expectedRevision: v.number(),
    sections: v.any(),
    nextFollowUpDueAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "mat.access");
    await requireCapability(ctx, "encounter.write");
    const note = await ctx.db.get(args.noteId);
    if (!note) throw new Error("Note not found");
    if (note.status !== "draft") {
      throw new Error("Signed notes cannot be edited");
    }
    if (note.revision !== args.expectedRevision) {
      throw new Error(
        "This note changed in another session. Reload before saving",
      );
    }
    const sections = validateFollowUpSections(args.sections);
    await ctx.db.patch(note._id, {
      sections,
      nextFollowUpDueAt: args.nextFollowUpDueAt,
      revision: note.revision + 1,
      updatedByUserId: actor._id,
      updatedAt: Date.now(),
    });
    return { revision: note.revision + 1 };
  },
});

export const getFollowUpForEncounter = query({
  args: { encounterId: v.id("encounters") },
  handler: async (ctx, { encounterId }) => {
    await requireCapability(ctx, "mat.access");
    return await ctx.db
      .query("matFollowUpNotes")
      .withIndex("by_encounter", (q) => q.eq("encounterId", encounterId))
      .unique();
  },
});

/**
 * Called by encounters.signEncounter. Validates required sections (per
 * appointment-type config, with defaults), locks the note, and copies the
 * provider-entered next follow-up date onto the episode.
 */
export async function signMatFollowUpIfPresent(
  ctx: MutationCtx,
  encounter: Doc<"encounters">,
  now: number,
): Promise<void> {
  const note = await ctx.db
    .query("matFollowUpNotes")
    .withIndex("by_encounter", (q) => q.eq("encounterId", encounter._id))
    .unique();
  if (!note) return;
  const appointment = await ctx.db.get(encounter.appointmentId);
  const config = appointment
    ? await ctx.db
        .query("matFollowUpConfigs")
        .withIndex("by_appointment_type", (q) =>
          q.eq("appointmentTypeId", appointment.appointmentTypeId),
        )
        .unique()
    : null;
  const required = config?.requiredSections ?? DEFAULT_REQUIRED_SECTIONS;
  const sections = note.sections as Record<string, string>;
  for (const key of required) {
    if (!String(sections[key] ?? "").trim()) {
      throw new Error(`MAT follow-up section "${key}" is required`);
    }
  }
  await ctx.db.patch(note._id, { status: "signed", signedAt: now });
  if (note.nextFollowUpDueAt !== undefined) {
    await ctx.db.patch(note.episodeId, {
      nextFollowUpDueAt: note.nextFollowUpDueAt,
      updatedAt: now,
    });
  }
}

// --- 9.4 Toxicology record tracking -----------------------------------
// Manual entry only; the `source` field is the adapter boundary for a
// future lab integration. Corrections create a new version chained via
// supersedesId/supersededById — record content is never mutated.

export const recordToxicology = mutation({
  args: {
    episodeId: v.id("matEpisodes"),
    specimenDate: v.string(),
    specimenType: v.string(),
    source: v.string(),
    status: v.union(v.literal("due"), v.literal("pending")),
    resultSummary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "mat.access");
    const episode = await ctx.db.get(args.episodeId);
    if (!episode) throw new Error("Episode not found");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.specimenDate)) {
      throw new Error("Specimen date must be YYYY-MM-DD");
    }
    const now = Date.now();
    const recordId = await ctx.db.insert("toxicologyRecords", {
      episodeId: episode._id,
      patientId: episode.patientId,
      specimenDate: args.specimenDate,
      specimenType: args.specimenType.trim(),
      source: args.source.trim(),
      status: args.status,
      resultSummary: args.resultSummary?.trim() || undefined,
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "mat.toxicology.recorded",
      entityType: "toxicologyRecords",
      entityId: recordId,
    });
    return recordId;
  },
});

export const reviewToxicology = mutation({
  args: {
    recordId: v.id("toxicologyRecords"),
    resultSummary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "encounter.sign");
    await requireCapability(ctx, "mat.access");
    const record = await ctx.db.get(args.recordId);
    if (!record) throw new Error("Record not found");
    if (record.supersededById) {
      throw new Error("A corrected record cannot be reviewed");
    }
    if (record.status === "reviewed") {
      throw new Error("Record is already reviewed");
    }
    const now = Date.now();
    await ctx.db.patch(record._id, {
      status: "reviewed",
      resultSummary: args.resultSummary?.trim() ?? record.resultSummary,
      reviewerUserId: actor._id,
      reviewedAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "mat.toxicology.reviewed",
      entityType: "toxicologyRecords",
      entityId: record._id,
    });
  },
});

export const correctToxicology = mutation({
  args: {
    recordId: v.id("toxicologyRecords"),
    reason: v.string(),
    specimenDate: v.optional(v.string()),
    specimenType: v.optional(v.string()),
    resultSummary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "mat.access");
    const original = await ctx.db.get(args.recordId);
    if (!original) throw new Error("Record not found");
    if (original.supersededById) {
      throw new Error("Record has already been corrected");
    }
    const reason = requireReason(args.reason);
    const now = Date.now();
    const correctionId = await ctx.db.insert("toxicologyRecords", {
      episodeId: original.episodeId,
      patientId: original.patientId,
      specimenDate: args.specimenDate ?? original.specimenDate,
      specimenType: args.specimenType?.trim() ?? original.specimenType,
      source: original.source,
      // A correction restarts review — the reviewer must look again.
      status: original.status === "due" ? "due" : "pending",
      resultSummary: args.resultSummary?.trim() ?? original.resultSummary,
      supersedesId: original._id,
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(original._id, {
      supersededById: correctionId,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "mat.toxicology.corrected",
      entityType: "toxicologyRecords",
      entityId: correctionId,
      reason,
    });
    return correctionId;
  },
});

export const listToxicologyForEpisode = query({
  args: { episodeId: v.id("matEpisodes") },
  handler: async (ctx, { episodeId }) => {
    await requireCapability(ctx, "mat.access");
    return await ctx.db
      .query("toxicologyRecords")
      .withIndex("by_episode", (q) => q.eq("episodeId", episodeId))
      .collect();
  },
});

export const listToxicologyByStatus = query({
  args: {
    status: v.union(
      v.literal("due"),
      v.literal("pending"),
      v.literal("reviewed"),
    ),
  },
  handler: async (ctx, { status }) => {
    await requireCapability(ctx, "mat.access");
    const records = await ctx.db
      .query("toxicologyRecords")
      .withIndex("by_status", (q) => q.eq("status", status))
      .collect();
    return records.filter((record) => !record.supersededById);
  },
});

// --- 9.5 MAT follow-up queue ------------------------------------------
// Queue items carry neutral operational labels only — clinical detail
// lives behind mat.access chart views, never in the item itself.

const QUEUE_LABELS = {
  followUpDue: "Follow-up due",
  toxicologyPending: "Monitoring pending",
  intakeReviewPending: "Intake review pending",
  clinicalReview: "Clinical review open",
} as const;

async function upsertQueueItem(
  ctx: MutationCtx,
  episodeId: Id<"matEpisodes">,
  kind: keyof typeof QUEUE_LABELS,
  dueAt: number,
): Promise<void> {
  const open = await ctx.db
    .query("monitoringEvents")
    .withIndex("by_episode_kind", (q) =>
      q.eq("episodeId", episodeId).eq("kind", kind).eq("status", "open"),
    )
    .first();
  const acknowledged = await ctx.db
    .query("monitoringEvents")
    .withIndex("by_episode_kind", (q) =>
      q
        .eq("episodeId", episodeId)
        .eq("kind", kind)
        .eq("status", "acknowledged"),
    )
    .first();
  if (open || acknowledged) return; // idempotent: one live item per kind
  const now = Date.now();
  await ctx.db.insert("monitoringEvents", {
    episodeId,
    kind,
    label: QUEUE_LABELS[kind],
    dueAt,
    status: "open",
    createdAt: now,
    updatedAt: now,
  });
}

/** One bounded, idempotent reminder per episode per follow-up due date. */
async function enqueueFollowUpReminder(
  ctx: MutationCtx,
  episode: Doc<"matEpisodes">,
): Promise<void> {
  if (episode.nextFollowUpDueAt === undefined) return;
  const [patient, preference, templates] = await Promise.all([
    ctx.db.get(episode.patientId),
    ctx.db
      .query("communicationPreferences")
      .withIndex("by_patient", (q) => q.eq("patientId", episode.patientId))
      .unique(),
    ctx.db
      .query("messageTemplates")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect(),
  ]);
  if (!patient || !preference) return;
  for (const template of templates.filter(
    (item) => item.intent === "followUpDue",
  )) {
    const optedIn =
      template.channel === "sms" ? preference.smsOptIn : preference.emailOptIn;
    const destination =
      template.channel === "sms" ? patient.phone : patient.email;
    if (
      !optedIn ||
      !destination ||
      (await isSuppressed(ctx, patient._id, template.channel))
    ) {
      continue;
    }
    const version = await ctx.db
      .query("messageTemplateVersions")
      .withIndex("by_template_status", (q) =>
        q.eq("templateId", template._id).eq("status", "published"),
      )
      .unique();
    if (!version) continue;
    const idempotencyKey = communicationIdempotencyKey({
      intent: template.intent,
      patientId: patient._id,
      referenceId: episode._id,
      channel: template.channel,
      schedulePoint: episode.nextFollowUpDueAt,
    });
    if (
      await ctx.db
        .query("communicationJobs")
        .withIndex("by_idempotency_key", (q) =>
          q.eq("idempotencyKey", idempotencyKey),
        )
        .unique()
    ) {
      continue;
    }
    const now = Date.now();
    await ctx.db.insert("communicationJobs", {
      patientId: patient._id,
      templateVersionId: version._id,
      intent: template.intent,
      channel: template.channel,
      destination,
      scheduledAt: now,
      idempotencyKey,
      status: "pending",
      retryCount: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function sweep(ctx: MutationCtx): Promise<void> {
  const now = Date.now();
  const active = await ctx.db
    .query("matEpisodes")
    .withIndex("by_state_due", (q) => q.eq("state", "active"))
    .collect();
  for (const episode of active) {
    if (
      episode.nextFollowUpDueAt !== undefined &&
      episode.nextFollowUpDueAt <= now
    ) {
      await upsertQueueItem(
        ctx,
        episode._id,
        "followUpDue",
        episode.nextFollowUpDueAt,
      );
      await enqueueFollowUpReminder(ctx, episode);
    }
    const pendingTox = await ctx.db
      .query("toxicologyRecords")
      .withIndex("by_episode", (q) => q.eq("episodeId", episode._id))
      .collect();
    if (
      pendingTox.some(
        (record) => !record.supersededById && record.status !== "reviewed",
      )
    ) {
      await upsertQueueItem(ctx, episode._id, "toxicologyPending", now);
    }
    const intakes = await ctx.db
      .query("matAssessments")
      .withIndex("by_episode", (q) => q.eq("episodeId", episode._id))
      .collect();
    if (intakes.some((intake) => intake.reviewStatus === "pending")) {
      await upsertQueueItem(ctx, episode._id, "intakeReviewPending", now);
    }
    const reviewTasks = await ctx.db
      .query("clinicalReviewTasks")
      .withIndex("by_patient", (q) => q.eq("patientId", episode.patientId))
      .collect();
    if (reviewTasks.some((task) => task.status !== "resolved")) {
      await upsertQueueItem(ctx, episode._id, "clinicalReview", now);
    }
  }
}

// Cron entry point (see scheduledJobs.ts).
export const sweepQueue = internalMutation({
  args: {},
  handler: async (ctx) => {
    await sweep(ctx);
  },
});

// Staff-triggered refresh so the queue never has to wait for the cron.
export const refreshQueue = mutation({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "mat.access");
    await sweep(ctx);
  },
});

export const listQueue = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "mat.access");
    const items = [
      ...(await ctx.db
        .query("monitoringEvents")
        .withIndex("by_status_due", (q) => q.eq("status", "open"))
        .collect()),
      ...(await ctx.db
        .query("monitoringEvents")
        .withIndex("by_status_due", (q) => q.eq("status", "acknowledged"))
        .collect()),
    ];
    return await Promise.all(
      items.map(async (item) => {
        const episode = await ctx.db.get(item.episodeId);
        const patient = episode ? await ctx.db.get(episode.patientId) : null;
        return {
          ...item,
          patientId: episode?.patientId,
          patientName: patient
            ? `${patient.legalFirstName} ${patient.legalLastName}`
            : "(unknown)",
        };
      }),
    );
  },
});

export const assignQueueItem = mutation({
  args: { itemId: v.id("monitoringEvents"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "mat.access");
    const item = await ctx.db.get(args.itemId);
    if (!item || item.status === "resolved") {
      throw new Error("Queue item is not open");
    }
    await ctx.db.patch(item._id, {
      assignedToUserId: args.userId,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "mat.queue.assigned",
      entityType: "monitoringEvents",
      entityId: item._id,
    });
  },
});

export const acknowledgeQueueItem = mutation({
  args: { itemId: v.id("monitoringEvents") },
  handler: async (ctx, { itemId }) => {
    const actor = await requireCapability(ctx, "mat.access");
    const item = await ctx.db.get(itemId);
    if (!item || item.status !== "open") {
      throw new Error("Queue item is not open");
    }
    await ctx.db.patch(item._id, {
      status: "acknowledged",
      acknowledgedByUserId: actor._id,
      acknowledgedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "mat.queue.acknowledged",
      entityType: "monitoringEvents",
      entityId: item._id,
    });
  },
});

export const resolveQueueItem = mutation({
  args: { itemId: v.id("monitoringEvents"), disposition: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "mat.access");
    const item = await ctx.db.get(args.itemId);
    if (!item || item.status === "resolved") {
      throw new Error("Queue item is already resolved");
    }
    const disposition = requireReason(args.disposition);
    await ctx.db.patch(item._id, {
      status: "resolved",
      disposition,
      resolvedByUserId: actor._id,
      resolvedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "mat.queue.resolved",
      entityType: "monitoringEvents",
      entityId: item._id,
      reason: disposition,
    });
  },
});

export const listEpisodesForPatient = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    await requireCapability(ctx, "mat.access");
    return await ctx.db
      .query("matEpisodes")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .collect();
  },
});

export const getEpisode = query({
  args: { episodeId: v.id("matEpisodes") },
  handler: async (ctx, { episodeId }) => {
    await requireCapability(ctx, "mat.access");
    return await ctx.db.get(episodeId);
  },
});
