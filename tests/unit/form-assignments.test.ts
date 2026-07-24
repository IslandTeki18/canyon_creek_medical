// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createSelfLink } from "../../convex/lib/access";
import schema from "../../convex/schema";
import { INTAKE_DEFINITION, seedUser } from "../fixtures/forms";
import { seedPatients } from "../fixtures/patients";

const modules = import.meta.glob("../../convex/**/*.ts");

async function setup(tx: ReturnType<typeof convexTest>) {
  const [patientId] = await seedPatients(tx);
  const admin = await seedUser(tx, ["administrator"], "user_admin");
  const staff = await seedUser(tx, ["frontDesk"], "user_fd");
  const templateId = await admin.mutation(api.domains.forms.createTemplate, {
    name: "Intake",
    type: "intake",
  });
  const versionId = await admin.mutation(api.domains.forms.createDraftVersion, {
    templateId,
    definition: INTAKE_DEFINITION,
  });
  await admin.mutation(api.domains.forms.publishVersion, { versionId });
  await admin.mutation(api.domains.assignments.createRule, {
    templateId,
    audience: "all",
  });
  return { admin, staff, templateId, patientId };
}

test("running assignment twice produces no duplicates", async () => {
  const tx = convexTest(schema, modules);
  const { staff, patientId } = await setup(tx);

  const first = await staff.mutation(api.domains.assignments.runForPatient, {
    patientId,
  });
  expect(first.created).toBe(1);
  const second = await staff.mutation(api.domains.assignments.runForPatient, {
    patientId,
  });
  expect(second.created).toBe(0);

  const assignments = await staff.query(
    api.domains.assignments.listForPatient,
    { patientId },
  );
  expect(assignments).toHaveLength(1);
  expect(assignments[0].state).toBe("pending");
});

test("waiver requires reason and is audited; manual assignment dedupes", async () => {
  const tx = convexTest(schema, modules);
  const { staff, templateId, patientId } = await setup(tx);
  await staff.mutation(api.domains.assignments.runForPatient, { patientId });

  await expect(
    staff.mutation(api.domains.assignments.assignManually, {
      patientId,
      templateId,
      reason: "extra",
    }),
  ).rejects.toThrow("already assigned");

  const [assignment] = await staff.query(
    api.domains.assignments.listForPatient,
    { patientId },
  );
  await expect(
    staff.mutation(api.domains.assignments.waiveAssignment, {
      assignmentId: assignment._id,
      reason: " ",
    }),
  ).rejects.toThrow("reason is required");
  await staff.mutation(api.domains.assignments.waiveAssignment, {
    assignmentId: assignment._id,
    reason: "Completed on paper",
  });

  const after = await staff.query(api.domains.assignments.listForPatient, {
    patientId,
  });
  expect(after[0].state).toBe("waived");
  const audits = await tx.run((ctx) => ctx.db.query("auditEvents").collect());
  expect(audits.some((a) => a.action === "form.assignment.waived")).toBe(true);
});

test("retired templates are skipped for new assignments; history survives", async () => {
  const tx = convexTest(schema, modules);
  const { admin, staff, templateId, patientId } = await setup(tx);

  // Patient completes the form first.
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
  await staff.mutation(api.domains.assignments.runForPatient, { patientId });
  const responseId = await me.mutation(api.domains.intake.startMyResponse, {
    templateId,
  });
  const done = await me.mutation(api.domains.intake.submitMyResponse, {
    responseId,
    answers: { reason: "x", sleepHours: 8, tobacco: "no" },
  });
  expect(done.submitted).toBe(true);

  // Retire the template; completed state and the submission remain.
  await admin.mutation(api.domains.forms.setTemplateStatus, {
    templateId,
    status: "retired",
    reason: "Replaced",
  });
  const assignments = await staff.query(
    api.domains.assignments.listForPatient,
    { patientId },
  );
  expect(assignments[0].state).toBe("completed");
  expect(assignments[0].templateRetired).toBe(true);

  // New patients no longer receive it.
  const [, secondPatient] = await tx.run(async (ctx) =>
    ctx.db.query("patients").collect(),
  );
  const result = await staff.mutation(api.domains.assignments.runForPatient, {
    patientId: secondPatient._id,
  });
  expect(result.created).toBe(0);
});

test("patients and auditors cannot run or waive assignments", async () => {
  const tx = convexTest(schema, modules);
  const { patientId } = await setup(tx);
  for (const role of ["patient", "auditor"] as const) {
    const user = await seedUser(tx, [role], `user_${role}`);
    await expect(
      user.mutation(api.domains.assignments.runForPatient, { patientId }),
    ).rejects.toThrow("Not authorized");
  }
});
