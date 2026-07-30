// MAT operational workflow (Increment 9). Everything here is sensitive
// substance-use data: every public function requires "mat.access", and no
// content from these records is ever placed in notifications or general
// work queues. The software coordinates documentation only — treatment,
// medication, and eligibility decisions belong to clinicians.
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { requireCapability } from "../lib/access";
import { writeAudit } from "../lib/audit";

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
