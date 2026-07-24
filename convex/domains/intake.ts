import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { requireLinkedPatient } from "../lib/access";
import { writeAudit } from "../lib/audit";
import {
  computeScore,
  parseDefinition,
  validateAnswers,
  type Answers,
} from "../lib/forms";
import { publishedVersion } from "./forms";

// Patient-facing intake. Every function scopes through the caller's own
// linked patient; responses pin the exact version the patient saw.

/** Published intake/consent templates with the caller's response state. */
export const listMyForms = query({
  args: {},
  handler: async (ctx) => {
    const { patient } = await requireLinkedPatient(ctx);
    const templates = await ctx.db
      .query("formTemplates")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const responses = await ctx.db
      .query("formResponses")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
      .collect();
    const result = [];
    for (const template of templates) {
      const published = await publishedVersion(ctx, template._id);
      if (!published) continue;
      const response = responses
        .filter((r) => r.templateId === template._id)
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      result.push({
        templateId: template._id,
        name: template.name,
        type: template.type,
        responseStatus: response?.status ?? null,
      });
    }
    return result;
  },
});

async function requireOwnResponse(
  ctx: Parameters<typeof requireLinkedPatient>[0],
  responseId: Doc<"formResponses">["_id"],
) {
  const { user, patient } = await requireLinkedPatient(ctx);
  const response = await ctx.db.get(responseId);
  if (!response || response.patientId !== patient._id) {
    throw new Error("Not authorized");
  }
  return { user, patient, response };
}

/**
 * Opens the caller's draft for a template, creating one against the current
 * published version if needed. Returns the pinned definition so the client
 * renders exactly what will be validated.
 */
export const startMyResponse = mutation({
  args: { templateId: v.id("formTemplates") },
  handler: async (ctx, { templateId }) => {
    const { patient } = await requireLinkedPatient(ctx);
    const template = await ctx.db.get(templateId);
    if (!template || template.status !== "active") {
      throw new Error("Form not found");
    }
    const existing = await ctx.db
      .query("formResponses")
      .withIndex("by_patient_template", (q) =>
        q.eq("patientId", patient._id).eq("templateId", templateId),
      )
      .collect();
    const draft = existing.find((r) => r.status === "draft");
    if (draft) return draft._id;

    const published = await publishedVersion(ctx, templateId);
    if (!published) throw new Error("Form is not available");
    const now = Date.now();
    return await ctx.db.insert("formResponses", {
      patientId: patient._id,
      templateId,
      versionId: published._id,
      status: "draft",
      answers: {},
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Draft + its pinned version definition, for rendering and resuming. */
export const getMyResponse = query({
  args: { responseId: v.id("formResponses") },
  handler: async (ctx, { responseId }) => {
    const { response } = await requireOwnResponse(ctx, responseId);
    const version = await ctx.db.get(response.versionId);
    const template = await ctx.db.get(response.templateId);
    if (!version || !template) throw new Error("Form is not available");
    return {
      response,
      templateName: template.name,
      definition: parseDefinition(version.definition),
      // Version mismatch signal: the pinned version is no longer current.
      versionCurrent: version.status === "published",
    };
  },
});

const answersArg = v.record(
  v.string(),
  v.union(v.string(), v.number(), v.boolean(), v.array(v.string())),
);

/** Explicit draft save. Rejects malformed values but allows incompleteness. */
export const saveMyDraft = mutation({
  args: { responseId: v.id("formResponses"), answers: answersArg },
  handler: async (ctx, { responseId, answers }) => {
    const { response } = await requireOwnResponse(ctx, responseId);
    if (response.status !== "draft") {
      throw new Error("This form was already submitted");
    }
    const version = await ctx.db.get(response.versionId);
    const definition = parseDefinition(version!.definition);
    const errors = validateAnswers(definition, answers as Answers, {
      requireComplete: false,
    });
    const [firstError] = errors;
    if (firstError) {
      throw new Error(
        `Invalid answers: ${firstError.key} ${firstError.message}`,
      );
    }
    await ctx.db.patch(responseId, { answers, updatedAt: Date.now() });
  },
});

/**
 * Submission: full completion validation against the pinned version, which
 * must still be the current published version (otherwise the client offers
 * to restart on the new version). Score is computed server-side only —
 * client-supplied scores do not exist in the argument surface.
 */
export const submitMyResponse = mutation({
  args: { responseId: v.id("formResponses"), answers: answersArg },
  handler: async (ctx, { responseId, answers }) => {
    const { user, response } = await requireOwnResponse(ctx, responseId);
    if (response.status !== "draft") {
      throw new Error("This form was already submitted");
    }
    const version = await ctx.db.get(response.versionId);
    if (!version || version.status !== "published") {
      throw new Error(
        "This form was updated while you were filling it out. Review the new version and submit again.",
      );
    }
    const definition = parseDefinition(version.definition);
    const errors = validateAnswers(definition, answers as Answers, {
      requireComplete: true,
    });
    if (errors.length > 0) {
      return { submitted: false as const, errors };
    }
    await ctx.db.patch(responseId, {
      answers,
      status: "submitted",
      score: computeScore(definition, answers as Answers),
      submittedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor: user,
      action: "form.response.submitted",
      entityType: "formResponses",
      entityId: responseId,
    });
    return { submitted: true as const };
  },
});

/**
 * Restart after a version mismatch: repin the draft to the current published
 * version, keeping compatible answers. Submit re-validates everything against
 * the new definition, so stale keys are rejected there.
 */
export const restartMyResponse = mutation({
  args: { responseId: v.id("formResponses") },
  handler: async (ctx, { responseId }) => {
    const { response } = await requireOwnResponse(ctx, responseId);
    if (response.status !== "draft") {
      throw new Error("This form was already submitted");
    }
    const published = await publishedVersion(ctx, response.templateId);
    if (!published) throw new Error("Form is not available");
    if (published._id === response.versionId) return;
    const definition = parseDefinition(published.definition);
    const knownKeys = new Set(
      definition.sections.flatMap((s) => s.fields.map((f) => f.key)),
    );
    const carried = Object.fromEntries(
      Object.entries(response.answers as Answers).filter(([key]) =>
        knownKeys.has(key),
      ),
    );
    await ctx.db.patch(responseId, {
      versionId: published._id,
      answers: carried,
      updatedAt: Date.now(),
    });
  },
});
