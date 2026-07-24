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
    name: "Intake",
    type: "intake",
  });
  const versionId = await admin.mutation(api.domains.forms.createDraftVersion, {
    templateId,
    definition: INTAKE_DEFINITION,
  });
  await admin.mutation(api.domains.forms.publishVersion, { versionId });
  return { me, admin, templateId, patientId };
}

const COMPLETE = {
  reason: "Synthetic reason",
  sleepHours: 7,
  tobacco: "no",
};

test("start, save draft, resume, and submit with server-side score", async () => {
  const tx = convexTest(schema, modules);
  const { me, templateId } = await setup(tx);

  const responseId = await me.mutation(api.domains.intake.startMyResponse, {
    templateId,
  });
  // Starting again resumes the same draft.
  expect(
    await me.mutation(api.domains.intake.startMyResponse, { templateId }),
  ).toBe(responseId);

  await me.mutation(api.domains.intake.saveMyDraft, {
    responseId,
    answers: { reason: "Synthetic reason" },
  });
  const resumed = await me.query(api.domains.intake.getMyResponse, {
    responseId,
  });
  expect(resumed.response.answers).toEqual({ reason: "Synthetic reason" });

  // Incomplete submit returns field errors, does not submit.
  const incomplete = await me.mutation(api.domains.intake.submitMyResponse, {
    responseId,
    answers: { reason: "Synthetic reason" },
  });
  expect(incomplete.submitted).toBe(false);

  const done = await me.mutation(api.domains.intake.submitMyResponse, {
    responseId,
    answers: COMPLETE,
  });
  expect(done.submitted).toBe(true);

  const stored = await tx.run((ctx) => ctx.db.get(responseId));
  expect(stored?.status).toBe("submitted");
  expect(stored?.score).toBe(7); // computed server-side (sum of sleepHours)

  // Submitted responses are immutable.
  await expect(
    me.mutation(api.domains.intake.saveMyDraft, {
      responseId,
      answers: {},
    }),
  ).rejects.toThrow("already submitted");
});

test("crafted payloads are rejected: unknown keys, bad types, hidden-required trick", async () => {
  const tx = convexTest(schema, modules);
  const { me, templateId } = await setup(tx);
  const responseId = await me.mutation(api.domains.intake.startMyResponse, {
    templateId,
  });

  await expect(
    me.mutation(api.domains.intake.saveMyDraft, {
      responseId,
      answers: { hacked: "x" },
    }),
  ).rejects.toThrow("Invalid answers");
  await expect(
    me.mutation(api.domains.intake.saveMyDraft, {
      responseId,
      answers: { sleepHours: 99 },
    }),
  ).rejects.toThrow("Invalid answers");

  // Conditional required field enforced when visible.
  const result = await me.mutation(api.domains.intake.submitMyResponse, {
    responseId,
    answers: { ...COMPLETE, tobacco: "yes" },
  });
  expect(result.submitted).toBe(false);
  expect(result.submitted === false && result.errors).toContainEqual({
    key: "tobaccoType",
    message: "This field is required",
  });
});

test("version mismatch blocks submit; restart repins and keeps answers", async () => {
  const tx = convexTest(schema, modules);
  const { me, admin, templateId } = await setup(tx);
  const responseId = await me.mutation(api.domains.intake.startMyResponse, {
    templateId,
  });
  await me.mutation(api.domains.intake.saveMyDraft, {
    responseId,
    answers: { reason: "Keep me" },
  });

  // Admin publishes v2 while the patient is mid-form.
  const v2 = await admin.mutation(api.domains.forms.createDraftVersion, {
    templateId,
  });
  await admin.mutation(api.domains.forms.publishVersion, { versionId: v2 });

  await expect(
    me.mutation(api.domains.intake.submitMyResponse, {
      responseId,
      answers: COMPLETE,
    }),
  ).rejects.toThrow("updated while you were filling");

  await me.mutation(api.domains.intake.restartMyResponse, { responseId });
  const reloaded = await me.query(api.domains.intake.getMyResponse, {
    responseId,
  });
  expect(reloaded.versionCurrent).toBe(true);
  expect(reloaded.response.answers).toEqual({ reason: "Keep me" });
  const done = await me.mutation(api.domains.intake.submitMyResponse, {
    responseId,
    answers: COMPLETE,
  });
  expect(done.submitted).toBe(true);
});

test("other users cannot read or write someone else's response", async () => {
  const tx = convexTest(schema, modules);
  const { me, templateId } = await setup(tx);
  const responseId = await me.mutation(api.domains.intake.startMyResponse, {
    templateId,
  });

  // A different linked patient user.
  const otherPatient = await tx.run(async (ctx) =>
    ctx.db.insert("patients", {
      legalFirstName: "Other",
      legalLastName: "Person",
      dateOfBirth: "1990-01-01",
      status: "active" as const,
      normalizedLastName: "person",
      searchText: "other person 1990-01-01",
      createdByUserId: (await ctx.db.query("users").first())!._id,
      createdAt: 0,
      updatedAt: 0,
    }),
  );
  const otherUserId = await tx.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "user_other",
      type: "patient" as const,
      status: "active" as const,
      roles: ["patient" as const],
      displayName: "Synthetic Other",
      createdAt: 0,
      updatedAt: 0,
    }),
  );
  await tx.run((ctx) =>
    createSelfLink(ctx, {
      patientId: otherPatient,
      userId: otherUserId,
      verificationMethod: "invitation",
    }),
  );
  const other = tx.withIdentity({ subject: "user_other" });
  await expect(
    other.query(api.domains.intake.getMyResponse, { responseId }),
  ).rejects.toThrow("Not authorized");
  await expect(
    other.mutation(api.domains.intake.saveMyDraft, {
      responseId,
      answers: {},
    }),
  ).rejects.toThrow("Not authorized");
});
