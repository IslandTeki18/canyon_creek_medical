// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedMatWorld } from "../fixtures/mat";

const modules = import.meta.glob("../../convex/**/*.ts");

async function markOverdue(
  tx: ReturnType<typeof convexTest>,
  episodeId: Awaited<ReturnType<typeof seedMatWorld>>["episodeId"],
) {
  await tx.run(async (ctx) => {
    await ctx.db.patch(episodeId, { nextFollowUpDueAt: Date.now() - 1000 });
  });
}

test("sweep surfaces overdue work idempotently with neutral labels", async () => {
  const tx = convexTest(schema, modules);
  const { clinicalStaff, provider, episodeId } = await seedMatWorld(tx);
  await markOverdue(tx, episodeId);
  await clinicalStaff.mutation(api.domains.mat.recordToxicology, {
    episodeId,
    specimenDate: "2026-07-25",
    specimenType: "urine",
    source: "in-office",
    status: "pending",
  });
  await clinicalStaff.mutation(api.domains.mat.refreshQueue, {});
  await clinicalStaff.mutation(api.domains.mat.refreshQueue, {});
  const queue = await clinicalStaff.query(api.domains.mat.listQueue, {});
  expect(queue.map((item) => item.kind).sort()).toEqual([
    "followUpDue",
    "toxicologyPending",
  ]);
  // Neutral labels only — no substance-use wording in queue items.
  for (const item of queue) {
    expect(item.label).not.toMatch(/substance|toxicolog|medication|MAT/i);
  }

  const followUp = queue.find((item) => item.kind === "followUpDue")!;
  await clinicalStaff.mutation(api.domains.mat.acknowledgeQueueItem, {
    itemId: followUp._id,
  });
  await expect(
    clinicalStaff.mutation(api.domains.mat.resolveQueueItem, {
      itemId: followUp._id,
      disposition: " ",
    }),
  ).rejects.toThrow("reason is required");
  await clinicalStaff.mutation(api.domains.mat.resolveQueueItem, {
    itemId: followUp._id,
    disposition: "Appointment scheduled",
  });
  // Resolved items leave the queue; provider sees the remaining item.
  const after = await provider.query(api.domains.mat.listQueue, {});
  expect(after.map((item) => item.kind)).toEqual(["toxicologyPending"]);
});

test("overdue follow-up enqueues one bounded neutral reminder", async () => {
  const tx = convexTest(schema, modules);
  const { tx: _ignored, ...world } = { tx, ...(await seedMatWorld(tx)) };
  const { clinicalStaff, episodeId, patientId } = world;
  await markOverdue(tx, episodeId);
  // Neutral reminder template + opted-in preferences.
  const admin = await seedUser(tx, ["administrator"], "mat_queue_admin");
  const templateId = await admin.mutation(
    api.domains.communications.createTemplate,
    {
      name: "Follow-up due",
      intent: "followUpDue",
      channel: "sms",
      body: "Please contact the practice to schedule your appointment. Call {{practicePhone}}.",
    },
  );
  const versionId = await tx.run(async (ctx) => {
    const version = await ctx.db
      .query("messageTemplateVersions")
      .withIndex("by_template", (q) => q.eq("templateId", templateId))
      .unique();
    return version!._id;
  });
  await admin.mutation(api.domains.communications.publishTemplate, {
    versionId,
  });
  await tx.run(async (ctx) => {
    await ctx.db.insert("communicationPreferences", {
      patientId,
      smsOptIn: true,
      emailOptIn: false,
      voiceOptIn: false,
      preferredChannel: "sms",
      createdAt: 0,
      updatedAt: 0,
    });
  });
  await clinicalStaff.mutation(api.domains.mat.refreshQueue, {});
  await clinicalStaff.mutation(api.domains.mat.refreshQueue, {});
  const jobs = await tx.run((ctx) =>
    ctx.db
      .query("communicationJobs")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .collect(),
  );
  expect(jobs).toHaveLength(1);
  expect(jobs[0]?.intent).toBe("followUpDue");
});

test("queue reads and actions require mat.access", async () => {
  const tx = convexTest(schema, modules);
  await seedMatWorld(tx);
  const frontDesk = await seedUser(tx, ["frontDesk"], "mat_queue_fd");
  await expect(frontDesk.query(api.domains.mat.listQueue, {})).rejects.toThrow(
    "Not authorized",
  );
  await expect(
    frontDesk.mutation(api.domains.mat.refreshQueue, {}),
  ).rejects.toThrow("Not authorized");
});
