import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireLinkedPatient } from "../lib/access";
import { writeAudit } from "../lib/audit";
import { parseDefinition } from "../lib/forms";
import { publishedVersion } from "./forms";

// Consent acceptance. Records are insert-only — there is deliberately no
// mutation that edits or removes one — and they pin the immutable version.

/** Current published consent content for review before signature. */
export const getMyConsentContent = query({
  args: { templateId: v.id("formTemplates") },
  handler: async (ctx, { templateId }) => {
    const { patient } = await requireLinkedPatient(ctx);
    const template = await ctx.db.get(templateId);
    if (
      !template ||
      template.type !== "consent" ||
      template.status !== "active"
    ) {
      throw new Error("Consent not found");
    }
    const version = await publishedVersion(ctx, templateId);
    if (!version) throw new Error("Consent is not available");
    const existing = await ctx.db
      .query("consentRecords")
      .withIndex("by_patient_version", (q) =>
        q.eq("patientId", patient._id).eq("versionId", version._id),
      )
      .unique();
    return {
      templateName: template.name,
      versionId: version._id,
      versionNumber: version.version,
      definition: parseDefinition(version.definition),
      alreadySigned: existing !== null,
    };
  },
});

/**
 * Records acceptance of the exact version the patient reviewed. The client
 * passes the versionId it displayed; if publishing raced ahead, the mismatch
 * is rejected so a patient never signs text they did not see.
 */
export const signMyConsent = mutation({
  args: {
    templateId: v.id("formTemplates"),
    versionId: v.id("formVersions"),
    signatureName: v.string(),
    acknowledged: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { user, patient } = await requireLinkedPatient(ctx);
    if (!args.acknowledged) {
      throw new Error("You must acknowledge the consent to sign");
    }
    const signatureName = args.signatureName.trim();
    if (!signatureName) throw new Error("Type your full name to sign");

    const template = await ctx.db.get(args.templateId);
    if (!template || template.type !== "consent") {
      throw new Error("Consent not found");
    }
    const current = await publishedVersion(ctx, args.templateId);
    if (!current || current._id !== args.versionId) {
      throw new Error(
        "This consent was updated. Review the current version before signing.",
      );
    }
    const existing = await ctx.db
      .query("consentRecords")
      .withIndex("by_patient_version", (q) =>
        q.eq("patientId", patient._id).eq("versionId", current._id),
      )
      .unique();
    if (existing) throw new Error("This consent is already signed");

    const consentId = await ctx.db.insert("consentRecords", {
      patientId: patient._id,
      templateId: args.templateId,
      versionId: current._id,
      signerUserId: user._id,
      relationship: "self",
      signatureName,
      acknowledged: true,
      signedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor: user,
      action: "consent.signed",
      entityType: "consentRecords",
      entityId: consentId,
    });
    return consentId;
  },
});

/** Human-readable receipts for the caller's own consents. */
export const listMyConsents = query({
  args: {},
  handler: async (ctx) => {
    const { patient } = await requireLinkedPatient(ctx);
    const records = await ctx.db
      .query("consentRecords")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
      .collect();
    const receipts = [];
    for (const record of records) {
      const template = await ctx.db.get(record.templateId);
      const version = await ctx.db.get(record.versionId);
      receipts.push({
        _id: record._id,
        receipt: `"${template?.name ?? "Consent"}" (version ${
          version?.version ?? "?"
        }) signed by ${record.signatureName} (${record.relationship}) on ${new Date(
          record.signedAt,
        ).toISOString()}`,
        templateId: record.templateId,
        signedAt: record.signedAt,
      });
    }
    return receipts;
  },
});
