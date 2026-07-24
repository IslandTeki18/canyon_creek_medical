// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createSelfLink } from "../../convex/lib/access";
import schema from "../../convex/schema";
import {
  CONSENT_DEFINITION,
  INTAKE_DEFINITION,
  seedUser,
} from "../fixtures/forms";
import { seedPatients } from "../fixtures/patients";

const modules = import.meta.glob("../../convex/**/*.ts");

/** Patient with full profile, linked account, intake + consent assigned. */
async function setup(tx: ReturnType<typeof convexTest>) {
  const [patientId] = await seedPatients(tx);
  const userId = await tx.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      clerkUserId: "user_self",
      type: "patient" as const,
      status: "active" as const,
      roles: ["patient" as const],
      displayName: "Synthetic Self",
      createdAt: 0,
      updatedAt: 0,
    });
    // Complete every profile requirement.
    await ctx.db.insert("patientAddresses", {
      patientId,
      line1: "1 Test Way",
      city: "Boise",
      state: "ID",
      postalCode: "83702",
      use: "home" as const,
      createdAt: 0,
      updatedAt: 0,
    });
    await ctx.db.insert("emergencyContacts", {
      patientId,
      name: "Kin",
      relationship: "Sibling",
      phone: "5550100000",
      createdAt: 0,
      updatedAt: 0,
    });
    await ctx.db.insert("communicationPreferences", {
      patientId,
      smsOptIn: true,
      emailOptIn: true,
      voiceOptIn: false,
      preferredChannel: "sms" as const,
      createdAt: 0,
      updatedAt: 0,
    });
    await ctx.db.insert("pharmacies", {
      patientId,
      name: "Example Pharmacy",
      isPreferred: true,
      createdAt: 0,
      updatedAt: 0,
    });
    return id;
  });
  await tx.run((ctx) =>
    createSelfLink(ctx, {
      patientId,
      userId,
      verificationMethod: "invitation",
    }),
  );
  const me = tx.withIdentity({ subject: "user_self" });
  const admin = await seedUser(tx, ["administrator"], "user_admin");
  const staff = await seedUser(tx, ["frontDesk"], "user_fd");

  async function publishTemplate(name: string, type: "intake" | "consent") {
    const templateId = await admin.mutation(api.domains.forms.createTemplate, {
      name,
      type,
    });
    const versionId = await admin.mutation(
      api.domains.forms.createDraftVersion,
      {
        templateId,
        definition: type === "intake" ? INTAKE_DEFINITION : CONSENT_DEFINITION,
      },
    );
    await admin.mutation(api.domains.forms.publishVersion, { versionId });
    return templateId;
  }
  const intakeId = await publishTemplate("Intake", "intake");
  const consentId = await publishTemplate("Consent", "consent");
  for (const templateId of [intakeId, consentId]) {
    await admin.mutation(api.domains.assignments.createRule, {
      templateId,
      audience: "all",
    });
  }
  await staff.mutation(api.domains.assignments.runForPatient, { patientId });
  return { me, admin, staff, patientId, intakeId, consentId };
}

test("incomplete → ready as requirements are satisfied; reasons are explicit", async () => {
  const tx = convexTest(schema, modules);
  const { me, staff, patientId, intakeId, consentId } = await setup(tx);

  let readiness = await staff.query(api.domains.patients.getPatientReadiness, {
    patientId,
  });
  expect(readiness?.ready).toBe(false);
  const missing = readiness!.items.filter((i) => !i.satisfied);
  expect(missing.map((i) => i.label).sort()).toEqual(["Consent", "Intake"]);

  // Complete the intake form.
  const responseId = await me.mutation(api.domains.intake.startMyResponse, {
    templateId: intakeId,
  });
  await me.mutation(api.domains.intake.submitMyResponse, {
    responseId,
    answers: { reason: "x", sleepHours: 8, tobacco: "no" },
  });
  // Sign the consent.
  const content = await me.query(api.domains.consents.getMyConsentContent, {
    templateId: consentId,
  });
  await me.mutation(api.domains.consents.signMyConsent, {
    templateId: consentId,
    versionId: content.versionId,
    signatureName: "Avery Testerson",
    acknowledged: true,
  });

  readiness = await staff.query(api.domains.patients.getPatientReadiness, {
    patientId,
  });
  expect(readiness?.ready).toBe(true);
});

test("waived assignments count as satisfied", async () => {
  const tx = convexTest(schema, modules);
  const { me, staff, patientId, consentId } = await setup(tx);
  const assignments = await staff.query(
    api.domains.assignments.listForPatient,
    { patientId },
  );
  for (const a of assignments) {
    await staff.mutation(api.domains.assignments.waiveAssignment, {
      assignmentId: a._id,
      reason: "Completed on paper",
    });
  }
  const readiness = await staff.query(
    api.domains.patients.getPatientReadiness,
    { patientId },
  );
  expect(readiness?.ready).toBe(true);
  void me;
  void consentId;
});

test("superseded consent makes readiness incomplete again", async () => {
  const tx = convexTest(schema, modules);
  const { me, admin, staff, patientId, intakeId, consentId } = await setup(tx);

  const responseId = await me.mutation(api.domains.intake.startMyResponse, {
    templateId: intakeId,
  });
  await me.mutation(api.domains.intake.submitMyResponse, {
    responseId,
    answers: { reason: "x", sleepHours: 8, tobacco: "no" },
  });
  const content = await me.query(api.domains.consents.getMyConsentContent, {
    templateId: consentId,
  });
  await me.mutation(api.domains.consents.signMyConsent, {
    templateId: consentId,
    versionId: content.versionId,
    signatureName: "Avery Testerson",
    acknowledged: true,
  });
  expect(
    (
      await staff.query(api.domains.patients.getPatientReadiness, {
        patientId,
      })
    )?.ready,
  ).toBe(true);

  // Publishing a new consent version supersedes the signed one.
  const v2 = await admin.mutation(api.domains.forms.createDraftVersion, {
    templateId: consentId,
  });
  await admin.mutation(api.domains.forms.publishVersion, { versionId: v2 });

  const readiness = await staff.query(
    api.domains.patients.getPatientReadiness,
    { patientId },
  );
  expect(readiness?.ready).toBe(false);
  expect(readiness?.items.find((i) => i.label === "Consent")?.satisfied).toBe(
    false,
  );
});

test("pending assignments on retired templates stop blocking readiness", async () => {
  const tx = convexTest(schema, modules);
  const { admin, staff, patientId, intakeId, consentId } = await setup(tx);
  await admin.mutation(api.domains.forms.setTemplateStatus, {
    templateId: intakeId,
    status: "retired",
    reason: "Replaced",
  });
  await admin.mutation(api.domains.forms.setTemplateStatus, {
    templateId: consentId,
    status: "retired",
    reason: "Replaced",
  });
  const readiness = await staff.query(
    api.domains.patients.getPatientReadiness,
    { patientId },
  );
  expect(readiness?.ready).toBe(true);
});

test("patients cannot read staff readiness for other patients", async () => {
  const tx = convexTest(schema, modules);
  const { me, patientId } = await setup(tx);
  await expect(
    me.query(api.domains.patients.getPatientReadiness, { patientId }),
  ).rejects.toThrow("Not authorized");
});
