// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createSelfLink } from "../../convex/lib/access";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedPatients } from "../fixtures/patients";

const modules = import.meta.glob("../../convex/**/*.ts");

/**
 * One patient with an event of most timeline types, seeded directly so the
 * test exercises the timeline's permission filtering rather than every
 * upstream workflow.
 */
async function seedWorld(tx: ReturnType<typeof convexTest>) {
  const admin = await seedUser(tx, ["administrator"], "tl_admin");
  const frontDesk = await seedUser(tx, ["frontDesk"], "tl_front_desk");
  const provider = await seedUser(tx, ["provider"], "tl_provider");
  const [patientId] = await seedPatients(tx);
  await admin.mutation(api.domains.tasks.setQueue, {
    key: "clinicalFollowUp",
    label: "Clinical follow-up",
    requiredCapability: "clinical.manage",
    active: true,
  });
  await provider.mutation(api.domains.tasks.createTask, {
    queueKey: "clinicalFollowUp",
    title: "Confirm follow-up interval",
    patientId: patientId!,
  });

  const patientUserId = await tx.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "tl_patient",
      type: "patient" as const,
      status: "active" as const,
      roles: ["patient" as const],
      displayName: "Synthetic patient",
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

  await tx.run(async (ctx) => {
    const providerUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", "tl_provider"))
      .unique();
    // A clinical list entry (clinical.manage only).
    await ctx.db.insert("medications", {
      patientId: patientId!,
      name: "Synthetic medication",
      status: "active" as const,
      source: "clinician" as const,
      patientReported: false,
      reconciliationStatus: "confirmed" as const,
      authorUserId: providerUser!._id,
      createdAt: 3_000,
      updatedAt: 3_000,
    });
    // A staff-only document (never visible in the portal).
    const documentId = await ctx.db.insert("documents", {
      patientId: patientId!,
      category: "labResult",
      title: "Outside result",
      source: "staff" as const,
      visibility: "staff" as const,
      reviewStatus: "accepted" as const,
      createdByUserId: providerUser!._id,
      createdAt: 4_000,
      updatedAt: 4_000,
    });
    expect(documentId).toBeDefined();
    // A communication job (communication.manage only).
    const template = await ctx.db.insert("messageTemplates", {
      name: "Reminder",
      intent: "appointmentReminder",
      channel: "email" as const,
      status: "active" as const,
      createdByUserId: providerUser!._id,
      createdAt: 0,
      updatedAt: 0,
    });
    const version = await ctx.db.insert("messageTemplateVersions", {
      templateId: template,
      version: 1,
      status: "published" as const,
      body: "Appointment with the practice",
      createdByUserId: providerUser!._id,
      createdAt: 0,
      updatedAt: 0,
    });
    await ctx.db.insert("communicationJobs", {
      patientId: patientId!,
      templateVersionId: version,
      intent: "appointmentReminder",
      channel: "email" as const,
      destination: "synthetic@example.com",
      scheduledAt: 5_000,
      idempotencyKey: "synthetic-timeline-key",
      status: "sent" as const,
      retryCount: 0,
      nextAttemptAt: 5_000,
      createdAt: 5_000,
      updatedAt: 5_000,
    });
  });

  return {
    frontDesk,
    provider,
    patient: tx.withIdentity({ subject: "tl_patient" }),
    patientId: patientId!,
  };
}

test("the same patient produces permission-appropriate timelines", async () => {
  const tx = convexTest(schema, modules);
  const { frontDesk, provider, patientId } = await seedWorld(tx);

  const providerView = await provider.query(
    api.domains.timeline.listForPatient,
    { patientId },
  );
  const providerTypes = new Set(providerView.entries.map((e) => e.type));
  expect(providerTypes).toContain("medication");
  expect(providerTypes).toContain("task");
  expect(providerTypes).toContain("document");

  const frontDeskView = await frontDesk.query(
    api.domains.timeline.listForPatient,
    { patientId },
  );
  const frontDeskTypes = new Set(frontDeskView.entries.map((e) => e.type));
  // Denied types are omitted server-side, not hidden by the client.
  expect(frontDeskTypes).not.toContain("medication");
  expect(frontDeskTypes).not.toContain("encounter");
  expect(frontDeskTypes).not.toContain("task"); // queue needs clinical.manage
  expect(frontDeskTypes).toContain("communication");
});

test("a patient sees only their own patient-appropriate entries", async () => {
  const tx = convexTest(schema, modules);
  const { patient } = await seedWorld(tx);
  const view = await patient.query(api.domains.timeline.myTimeline, {});
  const types = new Set(view.entries.map((e) => e.type));
  expect(types).not.toContain("medication");
  expect(types).not.toContain("communication");
  expect(types).not.toContain("task");
  // The staff-only document is absent from the portal timeline.
  expect(types).not.toContain("document");
  // Nothing in a portal entry links into the workforce application.
  for (const entry of view.entries) {
    expect(entry.link ?? "/portal").toMatch(/^\/portal/);
  }
});

test("type filters and pagination are applied server-side", async () => {
  const tx = convexTest(schema, modules);
  const { provider, patientId } = await seedWorld(tx);
  const filtered = await provider.query(api.domains.timeline.listForPatient, {
    patientId,
    types: ["medication"],
  });
  expect(filtered.entries.map((e) => e.type)).toEqual(["medication"]);

  const firstPage = await provider.query(api.domains.timeline.listForPatient, {
    patientId,
    limit: 1,
  });
  expect(firstPage.entries).toHaveLength(1);
  expect(firstPage.nextBefore).toBe(firstPage.entries[0]!.at);

  const secondPage = await provider.query(api.domains.timeline.listForPatient, {
    patientId,
    limit: 1,
    before: firstPage.nextBefore!,
  });
  expect(secondPage.entries[0]!.at).toBeLessThan(firstPage.entries[0]!.at);
});

test("the timeline requires patient access", async () => {
  const tx = convexTest(schema, modules);
  const { patientId } = await seedWorld(tx);
  const auditor = await seedUser(tx, ["auditor"], "tl_auditor");
  await expect(
    auditor.query(api.domains.timeline.listForPatient, { patientId }),
  ).rejects.toThrow("Not authorized");
  const unlinked = await seedUser(tx, ["patient"], "tl_unlinked");
  await expect(
    unlinked.query(api.domains.timeline.myTimeline, {}),
  ).rejects.toThrow("No linked patient record");
});
