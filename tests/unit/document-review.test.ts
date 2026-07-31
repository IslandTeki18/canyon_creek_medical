// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createSelfLink } from "../../convex/lib/access";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedPatients } from "../fixtures/patients";

const modules = import.meta.glob("../../convex/**/*.ts");

async function storeBlob(tx: ReturnType<typeof convexTest>) {
  return await tx.run(
    async (ctx) =>
      await ctx.storage.store(
        new Blob(["synthetic"], { type: "application/pdf" }),
      ),
  );
}

/**
 * Staff, an administrator, and a portal patient linked to their own chart,
 * with the document review queue configured.
 */
async function seedWorld(tx: ReturnType<typeof convexTest>) {
  const admin = await seedUser(tx, ["administrator"], "rev_admin");
  const staff = await seedUser(tx, ["frontDesk"], "rev_staff");
  const [patientId] = await seedPatients(tx);
  const userId = await tx.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "rev_patient",
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
      userId,
      verificationMethod: "invitation",
    }),
  );
  await admin.mutation(api.domains.tasks.setQueue, {
    key: "documentReview",
    label: "Document review",
    requiredCapability: "patient.manage",
    active: true,
  });
  return {
    admin,
    staff,
    patient: tx.withIdentity({ subject: "rev_patient" }),
    patientId: patientId!,
  };
}

async function patientUpload(
  tx: ReturnType<typeof convexTest>,
  patient: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
) {
  const result = await patient.mutation(api.domains.documents.attachDocument, {
    storageId: await storeBlob(tx),
    category: "insurance",
    title: "Insurance card photo",
    mimeType: "application/pdf",
  });
  if (!result.ok) throw new Error(result.error);
  return result.documentId;
}

test("a patient upload lands pending and raises review work", async () => {
  const tx = convexTest(schema, modules);
  const { staff, patient } = await seedWorld(tx);
  const documentId = await patientUpload(tx, patient);

  const queue = await staff.query(api.domains.documents.listReviewQueue, {});
  expect(queue.map((d) => d._id)).toEqual([documentId]);
  expect(queue[0]?.reviewStatus).toBe("pending");

  const tasks = await staff.query(api.domains.tasks.listQueueTasks, {
    queueKey: "documentReview",
  });
  expect(tasks).toHaveLength(1);
  expect(tasks[0]?.entityId).toBe(documentId);
  // Neutral operational label: category only, never contents.
  expect(tasks[0]?.title).toBe("Review uploaded insurance document");

  // Pending uploads cannot be attached to clinical records yet.
  const provider = await seedUser(tx, ["provider"], "rev_provider");
  await expect(
    provider.mutation(api.domains.documents.linkDocument, {
      documentId,
      entityType: "encounters",
      entityId: "enc_synthetic",
    }),
  ).rejects.toThrow("Only reviewed documents can be linked");
});

test("review decisions close the task, are audited, and gate linking", async () => {
  const tx = convexTest(schema, modules);
  const { staff, patient } = await seedWorld(tx);
  const documentId = await patientUpload(tx, patient);

  await expect(
    staff.mutation(api.domains.documents.reviewDocument, {
      documentId,
      decision: "restricted",
    }),
  ).rejects.toThrow("A reason is required");

  await staff.mutation(api.domains.documents.reviewDocument, {
    documentId,
    decision: "accepted",
    category: "identification",
  });
  expect(await staff.query(api.domains.documents.listReviewQueue, {})).toEqual(
    [],
  );
  expect(
    await staff.query(api.domains.tasks.listQueueTasks, {
      queueKey: "documentReview",
    }),
  ).toEqual([]);

  const provider = await seedUser(tx, ["provider"], "rev_provider_2");
  await provider.mutation(api.domains.documents.linkDocument, {
    documentId,
    entityType: "encounters",
    entityId: "enc_synthetic",
  });
  const [linked] = await tx.run(
    async (ctx) => await ctx.db.query("documents").collect(),
  );
  expect(linked?.category).toBe("identification");
  expect(linked?.links).toEqual([
    { entityType: "encounters", entityId: "enc_synthetic" },
  ]);

  const audit = await tx.run(async (ctx) =>
    (await ctx.db.query("auditEvents").collect()).map((e) => e.action),
  );
  expect(audit).toContain("document.review.accepted");
  expect(audit).toContain("document.linked");
});

test("replacements preserve prior versions and re-enter review", async () => {
  const tx = convexTest(schema, modules);
  const { staff, patient } = await seedWorld(tx);
  const documentId = await patientUpload(tx, patient);
  await staff.mutation(api.domains.documents.reviewDocument, {
    documentId,
    decision: "replacementRequested",
    note: "Image is unreadable",
  });

  const replaced = await patient.mutation(api.domains.documents.addVersion, {
    documentId,
    storageId: await storeBlob(tx),
    mimeType: "application/pdf",
  });
  expect(replaced.ok).toBe(true);

  const versions = await tx.run(async (ctx) =>
    (await ctx.db.query("documentVersions").collect()).sort(
      (a, b) => a.version - b.version,
    ),
  );
  expect(versions).toHaveLength(2);
  expect(versions[0]?.supersededAt).toBeGreaterThan(0);
  expect(versions[1]?.supersededAt).toBeUndefined();
  // The replacement is unreviewed again, and review work is raised anew.
  const queue = await staff.query(api.domains.documents.listReviewQueue, {});
  expect(queue.map((d) => d._id)).toEqual([documentId]);
});

test("patient notifications are neutral and only accepted documents are shared", async () => {
  const tx = convexTest(schema, modules);
  const { admin, staff, patient, patientId } = await seedWorld(tx);
  const documentId = await patientUpload(tx, patient);

  // A neutral, published template for the availability intent.
  await admin.mutation(api.domains.communications.createTemplate, {
    name: "Document available",
    intent: "documentAvailable",
    channel: "email",
    subject: "A message from the practice",
    body: "A new item is available in your {{practiceName}} portal.",
  });
  const [template] = await admin.query(
    api.domains.communications.listTemplates,
    {},
  );
  await admin.mutation(api.domains.communications.publishTemplate, {
    versionId: template!.versions[0]!._id,
  });
  await tx.run(async (ctx) => {
    const preference = await ctx.db
      .query("communicationPreferences")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .unique();
    if (!preference) {
      await ctx.db.insert("communicationPreferences", {
        patientId,
        smsOptIn: false,
        emailOptIn: true,
        voiceOptIn: false,
        preferredChannel: "email" as const,
        createdAt: 0,
        updatedAt: 0,
      });
    }
  });

  await expect(
    staff.mutation(api.domains.documents.setPatientVisibility, {
      documentId,
      visible: true,
    }),
  ).rejects.toThrow("Only accepted documents");

  await staff.mutation(api.domains.documents.reviewDocument, {
    documentId,
    decision: "accepted",
  });
  await staff.mutation(api.domains.documents.setPatientVisibility, {
    documentId,
    visible: true,
  });

  const jobs = await tx.run(
    async (ctx) => await ctx.db.query("communicationJobs").collect(),
  );
  expect(jobs).toHaveLength(1);
  expect(jobs[0]?.intent).toBe("documentAvailable");
  // The notification names no document, category, or clinical detail.
  expect(JSON.stringify(jobs[0])).not.toMatch(/insurance|identification/i);

  // Repeating the share does not duplicate the logical message.
  await staff.mutation(api.domains.documents.setPatientVisibility, {
    documentId,
    visible: false,
  });
  await staff.mutation(api.domains.documents.setPatientVisibility, {
    documentId,
    visible: true,
  });
  expect(
    await tx.run(
      async (ctx) => (await ctx.db.query("communicationJobs").collect()).length,
    ),
  ).toBe(1);
});
