// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createSelfLink } from "../../convex/lib/access";
import schema from "../../convex/schema";
import { CONSENT_DEFINITION, seedUser } from "../fixtures/forms";
import { seedPatients } from "../fixtures/patients";

const modules = import.meta.glob("../../convex/**/*.ts");

async function setup(tx: ReturnType<typeof convexTest>) {
  const [patientId] = await seedPatients(tx);
  const userId = await tx.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "user_self",
      type: "patient" as const,
      status: "active" as const,
      roles: ["patient" as const],
      displayName: "Synthetic Self",
      createdAt: 0,
      updatedAt: 0,
    }),
  );
  await tx.run((ctx) =>
    createSelfLink(ctx, {
      patientId,
      userId,
      verificationMethod: "invitation",
    }),
  );
  const me = tx.withIdentity({ subject: "user_self" });
  const admin = await seedUser(tx, ["administrator"], "user_admin");
  const templateId = await admin.mutation(api.domains.forms.createTemplate, {
    name: "Consent to Treatment",
    type: "consent",
  });
  const versionId = await admin.mutation(api.domains.forms.createDraftVersion, {
    templateId,
    definition: CONSENT_DEFINITION,
  });
  await admin.mutation(api.domains.forms.publishVersion, { versionId });
  return { me, admin, templateId, patientId };
}

test("consent requires acknowledgement and name, signs once, yields a receipt", async () => {
  const tx = convexTest(schema, modules);
  const { me, templateId } = await setup(tx);
  const content = await me.query(api.domains.consents.getMyConsentContent, {
    templateId,
  });

  await expect(
    me.mutation(api.domains.consents.signMyConsent, {
      templateId,
      versionId: content.versionId,
      signatureName: "Avery Testerson",
      acknowledged: false,
    }),
  ).rejects.toThrow("acknowledge");
  await expect(
    me.mutation(api.domains.consents.signMyConsent, {
      templateId,
      versionId: content.versionId,
      signatureName: "  ",
      acknowledged: true,
    }),
  ).rejects.toThrow("full name");

  await me.mutation(api.domains.consents.signMyConsent, {
    templateId,
    versionId: content.versionId,
    signatureName: "Avery Testerson",
    acknowledged: true,
  });
  await expect(
    me.mutation(api.domains.consents.signMyConsent, {
      templateId,
      versionId: content.versionId,
      signatureName: "Avery Testerson",
      acknowledged: true,
    }),
  ).rejects.toThrow("already signed");

  const receipts = await me.query(api.domains.consents.listMyConsents, {});
  expect(receipts).toHaveLength(1);
  expect(receipts[0].receipt).toContain("Consent to Treatment");
  expect(receipts[0].receipt).toContain("version 1");
  expect(receipts[0].receipt).toContain("Avery Testerson");

  const audits = await tx.run((ctx) => ctx.db.query("auditEvents").collect());
  expect(audits.some((a) => a.action === "consent.signed")).toBe(true);
});

test("cannot sign a superseded version; record traces to exact signed text", async () => {
  const tx = convexTest(schema, modules);
  const { me, admin, templateId } = await setup(tx);
  const shown = await me.query(api.domains.consents.getMyConsentContent, {
    templateId,
  });

  // New version published after the patient loaded the content.
  const v2 = await admin.mutation(api.domains.forms.createDraftVersion, {
    templateId,
    definition: {
      sections: [{ title: "Updated", content: "New text.", fields: [] }],
    },
  });
  await admin.mutation(api.domains.forms.publishVersion, { versionId: v2 });

  await expect(
    me.mutation(api.domains.consents.signMyConsent, {
      templateId,
      versionId: shown.versionId,
      signatureName: "Avery Testerson",
      acknowledged: true,
    }),
  ).rejects.toThrow("consent was updated");

  // Sign the current one; the record pins the immutable version content.
  const current = await me.query(api.domains.consents.getMyConsentContent, {
    templateId,
  });
  await me.mutation(api.domains.consents.signMyConsent, {
    templateId,
    versionId: current.versionId,
    signatureName: "Avery Testerson",
    acknowledged: true,
  });
  const record = await tx.run((ctx) => ctx.db.query("consentRecords").first());
  const signedVersion = await tx.run((ctx) => ctx.db.get(record!.versionId));
  expect(signedVersion?.definition.sections[0].content).toBe("New text.");
});

test("unlinked users cannot read or sign consents", async () => {
  const tx = convexTest(schema, modules);
  const { templateId } = await setup(tx);
  const stranger = await seedUser(tx, ["patient"], "user_stranger");
  await expect(
    stranger.query(api.domains.consents.getMyConsentContent, { templateId }),
  ).rejects.toThrow("No linked patient");
});
