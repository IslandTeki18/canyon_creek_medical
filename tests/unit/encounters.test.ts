// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createSelfLink } from "../../convex/lib/access";
import { zonedTimeToUtc } from "../../convex/lib/time";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedPatients } from "../fixtures/patients";
import { seedSchedulingWorld, TZ } from "../fixtures/scheduling";

const modules = import.meta.glob("../../convex/**/*.ts");
const SECTIONS = {
  history: "Synthetic history",
  assessment: "Clinician-authored assessment",
  plan: "Clinician-authored plan",
  risk: "Risk reviewed by clinician",
  education: "Education documented",
  followUp: "Follow up with the practice",
};

async function setupEncounter() {
  const tx = convexTest(schema, modules);
  const world = await seedSchedulingWorld(tx);
  const [patientId] = await seedPatients(tx);
  const frontDesk = await seedUser(tx, ["frontDesk"], "encounter_staff");
  const startAt = zonedTimeToUtc("2026-08-03", 10 * 60, TZ)!;
  const booked = await frontDesk.mutation(api.domains.appointments.book, {
    patientId: patientId!,
    appointmentTypeId: world.appointmentTypeId,
    providerId: world.providerId,
    startAt,
  });
  if (!booked.ok) throw new Error("fixture booking failed");
  const provider = tx.withIdentity({ subject: "user_fixture_provider" });
  const encounterId = await provider.mutation(
    api.domains.encounters.startEncounter,
    { appointmentId: booked.appointmentId, type: "Follow-up" },
  );
  return {
    tx,
    patientId: patientId!,
    provider,
    encounterId,
  };
}

test("draft saves reject stale revisions and signing locks the snapshot", async () => {
  const { tx, provider, encounterId } = await setupEncounter();
  await provider.mutation(api.domains.encounters.saveDraft, {
    encounterId,
    expectedRevision: 0,
    sections: SECTIONS,
  });
  await expect(
    provider.mutation(api.domains.encounters.saveDraft, {
      encounterId,
      expectedRevision: 0,
      sections: { ...SECTIONS, history: "Stale overwrite" },
    }),
  ).rejects.toThrow("changed in another session");

  await provider.mutation(api.domains.encounters.signEncounter, {
    encounterId,
    signatureName: "Dr. Synthetic",
  });
  const signedBefore = await tx.run((ctx) =>
    ctx.db
      .query("signedEncounterNotes")
      .withIndex("by_encounter", (q) => q.eq("encounterId", encounterId))
      .unique(),
  );
  await expect(
    provider.mutation(api.domains.encounters.saveDraft, {
      encounterId,
      expectedRevision: 1,
      sections: { ...SECTIONS, history: "Forbidden edit" },
    }),
  ).rejects.toThrow("cannot be edited");

  await provider.mutation(api.domains.encounters.addAmendment, {
    encounterId,
    reason: "Clarification",
    content: "Synthetic clarification",
    signatureName: "Dr. Synthetic",
  });
  const detail = await provider.query(api.domains.encounters.getEncounter, {
    encounterId,
  });
  expect(detail?.signed?.sections).toEqual(signedBefore?.sections);
  expect(detail?.amendments).toHaveLength(1);
  expect(detail?.encounter.status).toBe("amended");
});

test("encounter writes require the assigned active provider", async () => {
  const { tx, encounterId } = await setupEncounter();
  const otherProvider = await seedUser(tx, ["provider"], "other_provider");
  await expect(
    otherProvider.mutation(api.domains.encounters.saveDraft, {
      encounterId,
      expectedRevision: 0,
      sections: SECTIONS,
    }),
  ).rejects.toThrow("active provider identity");
  const frontDesk = await seedUser(tx, ["frontDesk"], "encounter_denied");
  await expect(
    frontDesk.query(api.domains.encounters.getEncounter, { encounterId }),
  ).rejects.toThrow("Not authorized");
});

test("only published current summaries reach the patient portal", async () => {
  const { tx, patientId, provider, encounterId } = await setupEncounter();
  await provider.mutation(api.domains.encounters.saveDraft, {
    encounterId,
    expectedRevision: 0,
    sections: SECTIONS,
  });
  await provider.mutation(api.domains.encounters.signEncounter, {
    encounterId,
    signatureName: "Dr. Synthetic",
  });
  const patientUserId = await tx.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "summary_patient",
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
      patientId,
      userId: patientUserId,
      verificationMethod: "invitation",
    }),
  );
  await tx.run((ctx) =>
    ctx.db.insert("communicationPreferences", {
      patientId,
      smsOptIn: false,
      emailOptIn: true,
      voiceOptIn: false,
      preferredChannel: "email",
      createdAt: 0,
      updatedAt: 0,
    }),
  );
  const patient = tx.withIdentity({ subject: "summary_patient" });
  const templateId = await provider.mutation(
    api.domains.communications.createTemplate,
    {
      name: "Portal document available",
      intent: "afterVisitSummaryAvailable",
      channel: "email",
      subject: "A message from the practice",
      body: "A document is available in your portal. Call {{practicePhone}} with questions.",
    },
  );
  const [template] = await provider.query(
    api.domains.communications.listTemplates,
    {},
  );
  expect(template._id).toBe(templateId);
  await provider.mutation(api.domains.communications.publishTemplate, {
    versionId: template.versions[0]._id,
  });

  const versionId = await provider.mutation(
    api.domains.encounters.createSummaryDraft,
    { encounterId, content: "Provider-approved summary" },
  );
  expect(
    await patient.query(api.domains.encounters.listMySummaries, {}),
  ).toHaveLength(0);
  await provider.mutation(api.domains.encounters.publishSummary, {
    versionId,
  });
  const visible = await patient.query(
    api.domains.encounters.listMySummaries,
    {},
  );
  expect(visible.map((summary) => summary.content)).toEqual([
    "Provider-approved summary",
  ]);
  const [notification] = await tx.run((ctx) =>
    ctx.db.query("communicationJobs").collect(),
  );
  expect(notification).toMatchObject({
    intent: "afterVisitSummaryAvailable",
    channel: "email",
    status: "pending",
  });

  const detail = await provider.query(api.domains.encounters.getEncounter, {
    encounterId,
  });
  await provider.mutation(api.domains.encounters.withdrawSummary, {
    summaryId: detail!.summary!._id,
    reason: "Correction needed",
  });
  expect(
    await patient.query(api.domains.encounters.listMySummaries, {}),
  ).toHaveLength(0);
  expect(
    await tx.run((ctx) =>
      ctx.db
        .query("afterVisitSummaryVersions")
        .withIndex("by_summary", (q) => q.eq("summaryId", detail!.summary!._id))
        .collect(),
    ),
  ).toHaveLength(2);
});
