// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createSelfLink } from "../../convex/lib/access";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedPatients } from "../fixtures/patients";

const modules = import.meta.glob("../../convex/**/*.ts");

async function setupPatientPortal() {
  const tx = convexTest(schema, modules);
  const [patientId] = await seedPatients(tx);
  const patientUserId = await tx.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "clinical_patient",
      type: "patient",
      status: "active",
      roles: ["patient"],
      displayName: "Synthetic Patient",
      createdAt: 0,
      updatedAt: 0,
    }),
  );
  await tx.run((ctx) =>
    createSelfLink(ctx, {
      patientId: patientId!,
      userId: patientUserId,
      verificationMethod: "invitation",
    }),
  );
  return {
    tx,
    patientId: patientId!,
    patient: tx.withIdentity({ subject: "clinical_patient" }),
  };
}

test("patient-reported medication remains pending until clinical review", async () => {
  const { tx, patientId, patient } = await setupPatientPortal();
  const clinician = await seedUser(tx, ["clinicalStaff"], "clinical_reviewer");

  const medicationId = await patient.mutation(
    api.domains.clinical.reportMyMedication,
    { name: "Synthetic medication", dose: "10 mg" },
  );
  const before = await patient.query(
    api.domains.clinical.listMyClinicalLists,
    {},
  );
  expect(before.medications[0]).toMatchObject({
    _id: medicationId,
    patientReported: true,
    source: "patient",
    reconciliationStatus: "pending",
  });

  const queue = await clinician.query(api.domains.clinical.listReviewQueue, {});
  expect(queue.medications).toHaveLength(1);
  await clinician.mutation(api.domains.clinical.reconcileMedication, {
    medicationId,
    status: "confirmed",
    reason: "Reviewed with patient",
  });
  const staffLists = await clinician.query(
    api.domains.clinical.listClinicalLists,
    { patientId },
  );
  expect(staffLists.medications[0]).toMatchObject({
    patientReported: true,
    reconciliationStatus: "confirmed",
  });
  expect(
    (await tx.run((ctx) => ctx.db.query("auditEvents").collect())).some(
      (event) => event.action === "medication.confirmed",
    ),
  ).toBe(true);
});

test("only providers author diagnoses and status history is append-only", async () => {
  const { tx, patientId } = await setupPatientPortal();
  const clinician = await seedUser(
    tx,
    ["clinicalStaff"],
    "diagnosis_clinician",
  );
  const provider = await seedUser(tx, ["provider"], "diagnosis_provider");

  await expect(
    clinician.mutation(api.domains.clinical.createDiagnosis, {
      patientId,
      codingSystem: "ICD-10-CM",
      code: "F41.9",
      display: "Anxiety disorder, unspecified",
    }),
  ).rejects.toThrow("Not authorized");

  const diagnosisId = await provider.mutation(
    api.domains.clinical.createDiagnosis,
    {
      patientId,
      codingSystem: "ICD-10-CM",
      code: "F41.9",
      display: "Anxiety disorder, unspecified",
    },
  );
  await provider.mutation(api.domains.clinical.setDiagnosisStatus, {
    diagnosisId,
    status: "resolved",
    reason: "Clinician documented resolution",
  });
  const diagnoses = await provider.query(api.domains.clinical.listDiagnoses, {
    patientId,
  });
  expect(diagnoses[0].status).toBe("resolved");
  expect(diagnoses[0].events.map((event) => event.toStatus)).toEqual([
    "active",
    "resolved",
  ]);
});

test("treatment plan revisions preserve history and filter portal items", async () => {
  const { tx, patientId, patient } = await setupPatientPortal();
  const provider = await seedUser(tx, ["provider"], "plan_provider");
  const planId = await provider.mutation(
    api.domains.clinical.createTreatmentPlan,
    {
      patientId,
      title: "Synthetic plan",
      goals: [
        { text: "Visible goal", patientVisible: true },
        { text: "Private goal", patientVisible: false },
      ],
      actions: [
        {
          text: "Visible action",
          kind: "lifestyle",
          patientVisible: true,
        },
      ],
    },
  );
  let plans = await provider.query(api.domains.clinical.listTreatmentPlans, {
    patientId,
  });
  await provider.mutation(api.domains.clinical.activateTreatmentPlan, {
    versionId: plans[0].versions[0]._id,
  });
  const version2 = await provider.mutation(
    api.domains.clinical.reviseTreatmentPlan,
    {
      planId,
      goals: [{ text: "Revised visible goal", patientVisible: true }],
      actions: [
        {
          text: "Private action",
          kind: "other",
          patientVisible: false,
        },
      ],
    },
  );
  await provider.mutation(api.domains.clinical.activateTreatmentPlan, {
    versionId: version2,
  });

  plans = await provider.query(api.domains.clinical.listTreatmentPlans, {
    patientId,
  });
  expect(plans[0].versions.map((version) => version.status)).toEqual([
    "active",
    "superseded",
  ]);
  const portalPlans = await patient.query(
    api.domains.clinical.listMyTreatmentPlans,
    {},
  );
  expect(portalPlans[0].goals.map((goal) => goal.text)).toEqual([
    "Revised visible goal",
  ]);
  expect(portalPlans[0].actions).toHaveLength(0);
});
