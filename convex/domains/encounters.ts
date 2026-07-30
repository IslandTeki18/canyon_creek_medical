import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mutation, query, type MutationCtx } from "../_generated/server";
import { requireCapability, requireLinkedPatient } from "../lib/access";
import { writeAudit } from "../lib/audit";
import { enqueueAfterVisitNotification } from "./communications";
import { signMatFollowUpIfPresent } from "./mat";

export const noteSectionsValidator = v.object({
  history: v.string(),
  assessment: v.string(),
  plan: v.string(),
  risk: v.string(),
  education: v.string(),
  followUp: v.string(),
});

export type NoteSections = {
  history: string;
  assessment: string;
  plan: string;
  risk: string;
  education: string;
  followUp: string;
};

const EMPTY_SECTIONS: NoteSections = {
  history: "",
  assessment: "",
  plan: "",
  risk: "",
  education: "",
  followUp: "",
};

function requireText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  if (trimmed.length > 50_000) throw new Error(`${label} is too long`);
  return trimmed;
}

function validateSections(sections: NoteSections): void {
  for (const [name, value] of Object.entries(sections)) {
    if (value.length > 50_000) throw new Error(`${name} is too long`);
  }
}

async function providerForActor(ctx: MutationCtx, actor: Doc<"users">) {
  const provider = await ctx.db
    .query("providers")
    .withIndex("by_user", (q) => q.eq("userId", actor._id))
    .unique();
  if (!provider || provider.status !== "active") {
    throw new Error("An active provider identity is required");
  }
  return provider;
}

async function requireAssignedProvider(
  ctx: MutationCtx,
  encounter: Doc<"encounters">,
  capability: "encounter.write" | "encounter.sign",
) {
  const actor = await requireCapability(ctx, capability);
  const provider = await providerForActor(ctx, actor);
  if (encounter.providerId !== provider._id) {
    throw new Error("Only the assigned provider may change this encounter");
  }
  return actor;
}

export const startEncounter = mutation({
  args: { appointmentId: v.id("appointments"), type: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "encounter.write");
    const provider = await providerForActor(ctx, actor);
    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment) throw new Error("Appointment not found");
    if (appointment.providerId !== provider._id) {
      throw new Error("Only the assigned provider may start this encounter");
    }
    if (
      !["scheduled", "confirmed", "checkedIn", "inProgress"].includes(
        appointment.status,
      )
    ) {
      throw new Error("Appointment is not eligible for an encounter");
    }
    const existing = await ctx.db
      .query("encounters")
      .withIndex("by_appointment", (q) =>
        q.eq("appointmentId", args.appointmentId),
      )
      .unique();
    if (existing) return existing._id;
    const now = Date.now();
    const encounterId = await ctx.db.insert("encounters", {
      patientId: appointment.patientId,
      appointmentId: appointment._id,
      providerId: provider._id,
      type: requireText(args.type, "Encounter type"),
      status: "draft",
      startedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("encounterDrafts", {
      encounterId,
      sections: EMPTY_SECTIONS,
      revision: 0,
      updatedByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "encounter.started",
      entityType: "encounters",
      entityId: encounterId,
    });
    return encounterId;
  },
});

export const listForPatient = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    await requireCapability(ctx, "encounter.read");
    const encounters = await ctx.db
      .query("encounters")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .order("desc")
      .collect();
    return await Promise.all(
      encounters.map(async (encounter) => ({
        ...encounter,
        providerName:
          (await ctx.db.get(encounter.providerId))?.displayName ?? "(unknown)",
      })),
    );
  },
});

export const getEncounter = query({
  args: { encounterId: v.id("encounters") },
  handler: async (ctx, { encounterId }) => {
    await requireCapability(ctx, "encounter.read");
    const encounter = await ctx.db.get(encounterId);
    if (!encounter) return null;
    const [draft, signed, amendments, summary] = await Promise.all([
      ctx.db
        .query("encounterDrafts")
        .withIndex("by_encounter", (q) => q.eq("encounterId", encounterId))
        .unique(),
      ctx.db
        .query("signedEncounterNotes")
        .withIndex("by_encounter", (q) => q.eq("encounterId", encounterId))
        .unique(),
      ctx.db
        .query("encounterAmendments")
        .withIndex("by_encounter", (q) => q.eq("encounterId", encounterId))
        .collect(),
      ctx.db
        .query("afterVisitSummaries")
        .withIndex("by_encounter", (q) => q.eq("encounterId", encounterId))
        .unique(),
    ]);
    const summaryVersions = summary
      ? await ctx.db
          .query("afterVisitSummaryVersions")
          .withIndex("by_summary", (q) => q.eq("summaryId", summary._id))
          .order("desc")
          .collect()
      : [];
    return {
      encounter,
      draft: encounter.status === "draft" ? draft : null,
      signed,
      amendments,
      summary,
      summaryVersions,
    };
  },
});

export const recordAccess = mutation({
  args: { encounterId: v.id("encounters") },
  handler: async (ctx, { encounterId }) => {
    const actor = await requireCapability(ctx, "encounter.read");
    if (!(await ctx.db.get(encounterId)))
      throw new Error("Encounter not found");
    await writeAudit(ctx, {
      actor,
      action: "encounter.viewed",
      entityType: "encounters",
      entityId: encounterId,
    });
  },
});

export const saveDraft = mutation({
  args: {
    encounterId: v.id("encounters"),
    expectedRevision: v.number(),
    sections: noteSectionsValidator,
  },
  handler: async (ctx, args) => {
    const encounter = await ctx.db.get(args.encounterId);
    if (!encounter) throw new Error("Encounter not found");
    const actor = await requireAssignedProvider(
      ctx,
      encounter,
      "encounter.write",
    );
    if (encounter.status !== "draft") {
      throw new Error("Signed encounters cannot be edited");
    }
    const draft = await ctx.db
      .query("encounterDrafts")
      .withIndex("by_encounter", (q) => q.eq("encounterId", args.encounterId))
      .unique();
    if (!draft) throw new Error("Encounter draft not found");
    if (draft.revision !== args.expectedRevision) {
      throw new Error(
        "This note changed in another session. Reload before saving",
      );
    }
    validateSections(args.sections);
    const revision = draft.revision + 1;
    const now = Date.now();
    await ctx.db.patch(draft._id, {
      sections: args.sections,
      revision,
      updatedByUserId: actor._id,
      updatedAt: now,
    });
    await ctx.db.patch(encounter._id, { updatedAt: now });
    return { revision, updatedAt: now };
  },
});

export const signEncounter = mutation({
  args: { encounterId: v.id("encounters"), signatureName: v.string() },
  handler: async (ctx, args) => {
    const encounter = await ctx.db.get(args.encounterId);
    if (!encounter) throw new Error("Encounter not found");
    const actor = await requireAssignedProvider(
      ctx,
      encounter,
      "encounter.sign",
    );
    if (encounter.status !== "draft") {
      throw new Error("Encounter is already signed");
    }
    if (args.signatureName.trim() !== actor.displayName.trim()) {
      throw new Error("Signature must match your account name");
    }
    const evaluation = await ctx.db
      .query("psychiatricEvaluations")
      .withIndex("by_encounter", (q) => q.eq("encounterId", args.encounterId))
      .unique();
    if (evaluation) {
      const config = await ctx.db.get(evaluation.configId);
      if (
        !config ||
        config.requiredSections.some(
          (key) =>
            !String(
              (evaluation.sections as Record<string, string>)[key] ?? "",
            ).trim(),
        )
      ) {
        throw new Error(
          "Required psychiatric evaluation sections are incomplete",
        );
      }
    }
    const draft = await ctx.db
      .query("encounterDrafts")
      .withIndex("by_encounter", (q) => q.eq("encounterId", args.encounterId))
      .unique();
    if (!draft) throw new Error("Encounter draft not found");
    for (const section of ["history", "assessment", "plan"] as const) {
      if (!draft.sections[section].trim()) {
        throw new Error(`${section} is required before signing`);
      }
    }
    const now = Date.now();
    // Throws if a linked MAT follow-up note is missing required sections;
    // otherwise locks it and records the next follow-up due date.
    await signMatFollowUpIfPresent(ctx, encounter, now);
    await ctx.db.insert("signedEncounterNotes", {
      encounterId: encounter._id,
      sections: draft.sections,
      draftRevision: draft.revision,
      signerUserId: actor._id,
      signerDisplayName: actor.displayName,
      signedAt: now,
    });
    await ctx.db.patch(encounter._id, {
      status: "signed",
      signedAt: now,
      updatedAt: now,
    });
    if (evaluation) {
      await ctx.db.patch(evaluation._id, { status: "signed", signedAt: now });
    }
    await writeAudit(ctx, {
      actor,
      action: "encounter.signed",
      entityType: "encounters",
      entityId: encounter._id,
    });
  },
});

export const addAmendment = mutation({
  args: {
    encounterId: v.id("encounters"),
    reason: v.string(),
    content: v.string(),
    signatureName: v.string(),
  },
  handler: async (ctx, args) => {
    const encounter = await ctx.db.get(args.encounterId);
    if (!encounter) throw new Error("Encounter not found");
    const actor = await requireCapability(ctx, "encounter.sign");
    await providerForActor(ctx, actor);
    if (encounter.status === "draft") {
      throw new Error("Draft encounters do not need amendments");
    }
    if (args.signatureName.trim() !== actor.displayName.trim()) {
      throw new Error("Signature must match your account name");
    }
    const reason = requireText(args.reason, "Amendment reason");
    const content = requireText(args.content, "Amendment");
    const now = Date.now();
    const amendmentId = await ctx.db.insert("encounterAmendments", {
      encounterId: encounter._id,
      reason,
      content,
      authorUserId: actor._id,
      authorDisplayName: actor.displayName,
      signedAt: now,
    });
    await ctx.db.patch(encounter._id, {
      status: "amended",
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "encounter.amended",
      entityType: "encounterAmendments",
      entityId: amendmentId,
      reason,
    });
    return amendmentId;
  },
});

export const createSummaryDraft = mutation({
  args: { encounterId: v.id("encounters"), content: v.string() },
  handler: async (ctx, args) => {
    const encounter = await ctx.db.get(args.encounterId);
    if (!encounter || encounter.status === "draft") {
      throw new Error("A signed encounter is required");
    }
    const actor = await requireAssignedProvider(
      ctx,
      encounter,
      "encounter.write",
    );
    let summary = await ctx.db
      .query("afterVisitSummaries")
      .withIndex("by_encounter", (q) => q.eq("encounterId", args.encounterId))
      .unique();
    const now = Date.now();
    if (!summary) {
      const summaryId = await ctx.db.insert("afterVisitSummaries", {
        encounterId: encounter._id,
        patientId: encounter.patientId,
        createdByUserId: actor._id,
        createdAt: now,
        updatedAt: now,
      });
      summary = await ctx.db.get(summaryId);
    }
    if (!summary) throw new Error("Could not create summary");
    const latest = await ctx.db
      .query("afterVisitSummaryVersions")
      .withIndex("by_summary", (q) => q.eq("summaryId", summary!._id))
      .order("desc")
      .first();
    if (latest?.status === "draft") throw new Error("A draft already exists");
    return await ctx.db.insert("afterVisitSummaryVersions", {
      summaryId: summary._id,
      version: (latest?.version ?? 0) + 1,
      status: "draft",
      content: args.content.trim(),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateSummaryDraft = mutation({
  args: {
    versionId: v.id("afterVisitSummaryVersions"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "encounter.write");
    const version = await ctx.db.get(args.versionId);
    if (!version || version.status !== "draft") {
      throw new Error("Only draft summaries can be edited");
    }
    const summary = await ctx.db.get(version.summaryId);
    const encounter = summary ? await ctx.db.get(summary.encounterId) : null;
    if (!encounter) throw new Error("Encounter not found");
    const provider = await providerForActor(ctx, actor);
    if (provider._id !== encounter.providerId)
      throw new Error("Not authorized");
    await ctx.db.patch(version._id, {
      content: args.content.trim(),
      updatedAt: Date.now(),
    });
  },
});

export const publishSummary = mutation({
  args: { versionId: v.id("afterVisitSummaryVersions") },
  handler: async (ctx, { versionId }) => {
    const version = await ctx.db.get(versionId);
    if (!version || version.status !== "draft") {
      throw new Error("Only draft summaries can be published");
    }
    const summary = await ctx.db.get(version.summaryId);
    const encounter = summary ? await ctx.db.get(summary.encounterId) : null;
    if (!summary || !encounter) throw new Error("Encounter not found");
    const actor = await requireAssignedProvider(
      ctx,
      encounter,
      "encounter.sign",
    );
    requireText(version.content, "Summary content");
    const now = Date.now();
    await ctx.db.patch(version._id, {
      status: "published",
      approvedByUserId: actor._id,
      publishedAt: now,
      updatedAt: now,
    });
    await enqueueAfterVisitNotification(ctx, {
      patientId: summary.patientId,
      appointmentId: encounter.appointmentId,
      summaryVersionId: version._id,
    });
    await writeAudit(ctx, {
      actor,
      action: "after_visit_summary.published",
      entityType: "afterVisitSummaryVersions",
      entityId: version._id,
    });
  },
});

export const withdrawSummary = mutation({
  args: { summaryId: v.id("afterVisitSummaries"), reason: v.string() },
  handler: async (ctx, args) => {
    const summary = await ctx.db.get(args.summaryId);
    const encounter = summary ? await ctx.db.get(summary.encounterId) : null;
    if (!summary || !encounter) throw new Error("Summary not found");
    const actor = await requireAssignedProvider(
      ctx,
      encounter,
      "encounter.sign",
    );
    const reason = requireText(args.reason, "Reason");
    const latest = await ctx.db
      .query("afterVisitSummaryVersions")
      .withIndex("by_summary", (q) => q.eq("summaryId", summary._id))
      .order("desc")
      .first();
    const now = Date.now();
    const versionId = await ctx.db.insert("afterVisitSummaryVersions", {
      summaryId: summary._id,
      version: (latest?.version ?? 0) + 1,
      status: "withdrawn",
      content: "",
      approvedByUserId: actor._id,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "after_visit_summary.withdrawn",
      entityType: "afterVisitSummaryVersions",
      entityId: versionId,
      reason,
    });
  },
});

export const listMySummaries = query({
  args: {},
  handler: async (ctx) => {
    const { patient } = await requireLinkedPatient(ctx);
    const summaries = await ctx.db
      .query("afterVisitSummaries")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
      .order("desc")
      .collect();
    const result = [];
    for (const summary of summaries) {
      const latest = await ctx.db
        .query("afterVisitSummaryVersions")
        .withIndex("by_summary", (q) => q.eq("summaryId", summary._id))
        .order("desc")
        .first();
      if (latest?.status !== "published") continue;
      result.push({
        _id: summary._id,
        version: latest.version,
        content: latest.content,
        publishedAt: latest.publishedAt,
      });
    }
    return result;
  },
});
