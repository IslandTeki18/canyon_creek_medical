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
import { scoreAssessment, type AssessmentScoring } from "../lib/assessments";
import { assignmentsWithState } from "./assignments";
import { publishedVersion } from "./forms";

// Patient-facing intake. Every function scopes through the caller's own
// linked patient; responses pin the exact version the patient saw.

/** The caller's assigned forms (assignment-driven since 4.5). */
export const listMyForms = query({
  args: {},
  handler: async (ctx) => {
    const { patient } = await requireLinkedPatient(ctx);
    const assignments = await assignmentsWithState(ctx, patient._id);
    const responses = await ctx.db
      .query("formResponses")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
      .collect();
    const ordinary = assignments
      .filter((a) => a.state !== "waived" && !a.templateRetired)
      .map((a) => {
        const hasDraft = responses.some(
          (r) => r.templateId === a.templateId && r.status === "draft",
        );
        return {
          templateId: a.templateId,
          name: a.templateName,
          type: a.templateType,
          responseStatus:
            a.state === "completed"
              ? ("submitted" as const)
              : hasDraft
                ? ("draft" as const)
                : null,
        };
      });
    const assessmentAssignments = await ctx.db
      .query("assessmentAssignments")
      .withIndex("by_patient", (q) =>
        q.eq("patientId", patient._id).eq("status", "pending"),
      )
      .collect();
    const assessments = [];
    for (const assignment of assessmentAssignments) {
      const version = await ctx.db
        .query("assessmentVersions")
        .withIndex("by_definition_status", (q) =>
          q
            .eq("assessmentDefinitionId", assignment.assessmentDefinitionId)
            .eq("status", "published"),
        )
        .unique();
      if (!version) continue;
      const [instrument, formVersion] = await Promise.all([
        ctx.db.get(assignment.assessmentDefinitionId),
        ctx.db.get(version.formVersionId),
      ]);
      if (!instrument || !formVersion) continue;
      const response = responses.find((r) => r._id === assignment.responseId);
      assessments.push({
        templateId: formVersion.templateId,
        name: instrument.name,
        type: "assessment" as const,
        responseStatus: response?.status ?? null,
      });
    }
    return [...ordinary, ...assessments];
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
    const assessmentVersion = await ctx.db
      .query("assessmentVersions")
      .withIndex("by_form_version", (q) => q.eq("formVersionId", published._id))
      .unique();
    const now = Date.now();
    const responseId = await ctx.db.insert("formResponses", {
      patientId: patient._id,
      templateId,
      versionId: published._id,
      status: "draft",
      answers: {},
      assessmentVersionId: assessmentVersion?._id,
      createdAt: now,
      updatedAt: now,
    });
    if (assessmentVersion) {
      const assignment = await ctx.db
        .query("assessmentAssignments")
        .withIndex("by_patient_definition", (q) =>
          q
            .eq("patientId", patient._id)
            .eq(
              "assessmentDefinitionId",
              assessmentVersion.assessmentDefinitionId,
            )
            .eq("status", "pending"),
        )
        .first();
      if (!assignment) throw new Error("Assessment is not assigned");
      await ctx.db.patch(assignment._id, { responseId, updatedAt: now });
    }
    return responseId;
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
    const assessmentVersion = response.assessmentVersionId
      ? await ctx.db.get(response.assessmentVersionId)
      : null;
    const score = assessmentVersion
      ? scoreAssessment(
          assessmentVersion.scoring as AssessmentScoring,
          answers as Answers,
        ).score
      : computeScore(definition, answers as Answers);
    const now = Date.now();
    await ctx.db.patch(responseId, {
      answers,
      status: "submitted",
      score,
      submittedAt: now,
      updatedAt: now,
    });
    if (assessmentVersion) {
      const assignment = await ctx.db
        .query("assessmentAssignments")
        .withIndex("by_patient_definition", (q) =>
          q
            .eq("patientId", response.patientId)
            .eq(
              "assessmentDefinitionId",
              assessmentVersion.assessmentDefinitionId,
            )
            .eq("status", "pending"),
        )
        .first();
      if (assignment) {
        await ctx.db.patch(assignment._id, {
          status: "completed",
          responseId,
          updatedAt: now,
        });
      }
      for (const rule of assessmentVersion.responseRules) {
        if ((answers as Answers)[rule.fieldKey] !== rule.equals) continue;
        const ruleKey = `${rule.fieldKey}:${String(rule.equals)}`;
        const duplicate = await ctx.db
          .query("clinicalReviewTasks")
          .withIndex("by_response_rule", (q) =>
            q.eq("responseId", responseId).eq("ruleKey", ruleKey),
          )
          .unique();
        if (!duplicate) {
          await ctx.db.insert("clinicalReviewTasks", {
            patientId: response.patientId,
            responseId,
            assessmentVersionId: assessmentVersion._id,
            ruleKey,
            priority: "high",
            status: "open",
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }
    await writeAudit(ctx, {
      actor: user,
      action: "form.response.submitted",
      entityType: "formResponses",
      entityId: responseId,
    });
    return {
      submitted: true as const,
      crisisInstructions: assessmentVersion?.responseRules
        .filter((rule) => (answers as Answers)[rule.fieldKey] === rule.equals)
        .map((rule) => rule.instructions),
    };
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
