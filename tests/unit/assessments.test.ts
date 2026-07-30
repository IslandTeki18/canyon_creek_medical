// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createSelfLink } from "../../convex/lib/access";
import { scoreAssessment } from "../../convex/lib/assessments";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedPatients } from "../fixtures/patients";

const modules = import.meta.glob("../../convex/**/*.ts");
const DEFINITION = {
  sections: [
    {
      title: "Symptoms",
      fields: [
        {
          key: "symptom",
          label: "Symptom frequency",
          type: "number" as const,
          min: 0,
          max: 3,
          required: true,
        },
        {
          key: "risk",
          label: "Risk response",
          type: "number" as const,
          min: 0,
          max: 1,
          required: true,
        },
      ],
    },
  ],
};
const SCORING = {
  fields: [
    { key: "symptom", weight: 1 },
    { key: "risk", weight: 2 },
  ],
  interpretations: [{ min: 0, max: 2, label: "Lower range" }],
};

test("known responses produce reproducible weighted scores", () => {
  expect(scoreAssessment(SCORING, { symptom: 2, risk: 1 })).toEqual({
    score: 4,
    interpretation: undefined,
  });
});

test("patient submission ignores client scores and creates one human-review task", async () => {
  const tx = convexTest(schema, modules);
  const admin = await seedUser(tx, ["administrator"], "assessment_admin");
  const provider = await seedUser(tx, ["provider"], "assessment_provider");
  const [patientId] = await seedPatients(tx);
  const { definitionId, templateId } = await admin.mutation(
    api.domains.assessments.createDefinition,
    { name: "Synthetic Measure", key: "synthetic", licensing: "Test use" },
  );
  const versionId = await admin.mutation(
    api.domains.assessments.createDraftVersion,
    {
      definitionId,
      templateId,
      formDefinition: DEFINITION,
      scoring: SCORING,
      responseRules: [
        {
          fieldKey: "risk",
          equals: 1,
          instructions: "Contact the practice for approved support.",
        },
      ],
      effectiveFrom: "2026-01-01",
    },
  );
  await admin.mutation(api.domains.assessments.publishVersion, { versionId });
  await expect(
    provider.mutation(api.domains.assessments.publishVersion, { versionId }),
  ).rejects.toThrow("Not authorized");
  await provider.mutation(api.domains.assessments.assign, {
    patientId: patientId!,
    definitionId,
    reason: "Interval measurement",
  });

  const userId = await tx.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "assessment_patient",
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
      userId,
      verificationMethod: "invitation",
    }),
  );
  const patient = tx.withIdentity({ subject: "assessment_patient" });
  const responseId = await patient.mutation(
    api.domains.intake.startMyResponse,
    { templateId },
  );
  const result = await patient.mutation(api.domains.intake.submitMyResponse, {
    responseId,
    answers: { symptom: 2, risk: 1 },
  });
  expect(result).toMatchObject({
    submitted: true,
    crisisInstructions: ["Contact the practice for approved support."],
  });
  const response = await tx.run((ctx) => ctx.db.get(responseId));
  expect(response?.score).toBe(4);
  expect(
    await tx.run((ctx) => ctx.db.query("clinicalReviewTasks").collect()),
  ).toHaveLength(1);
  await expect(
    patient.query(api.domains.assessments.listTrends, {
      patientId: patientId!,
    }),
  ).rejects.toThrow("Not authorized");
});

test("published scoring rules cannot be edited", async () => {
  const tx = convexTest(schema, modules);
  const admin = await seedUser(tx, ["administrator"], "immutable_assessment");
  const { definitionId, templateId } = await admin.mutation(
    api.domains.assessments.createDefinition,
    { name: "Immutable", key: "immutable", licensing: "Test use" },
  );
  const versionId = await admin.mutation(
    api.domains.assessments.createDraftVersion,
    {
      definitionId,
      templateId,
      formDefinition: DEFINITION,
      scoring: SCORING,
      responseRules: [],
      effectiveFrom: "2026-01-01",
    },
  );
  await admin.mutation(api.domains.assessments.publishVersion, { versionId });
  await expect(
    admin.mutation(api.domains.assessments.publishVersion, { versionId }),
  ).rejects.toThrow("Only draft");
});
