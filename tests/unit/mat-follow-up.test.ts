// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { zonedTimeToUtc } from "../../convex/lib/time";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedMatWorld } from "../fixtures/mat";
import { TZ } from "../fixtures/scheduling";

const modules = import.meta.glob("../../convex/**/*.ts");

const ENCOUNTER_SECTIONS = {
  history: "Synthetic history",
  assessment: "Synthetic assessment",
  plan: "Synthetic plan",
  risk: "Synthetic risk",
  education: "",
  followUp: "",
};

async function setupFollowUp() {
  const tx = convexTest(schema, modules);
  const world = await seedMatWorld(tx);
  const frontDesk = await seedUser(tx, ["frontDesk"], "mat_fu_fd");
  const booked = await frontDesk.mutation(api.domains.appointments.book, {
    patientId: world.patientId,
    appointmentTypeId: world.appointmentTypeId,
    providerId: world.providerId,
    startAt: zonedTimeToUtc("2026-08-04", 10 * 60, TZ)!,
  });
  if (!booked.ok) throw new Error("fixture booking failed");
  const encounterId = await world.provider.mutation(
    api.domains.encounters.startEncounter,
    { appointmentId: booked.appointmentId, type: "MAT follow-up" },
  );
  await world.provider.mutation(api.domains.encounters.saveDraft, {
    encounterId,
    expectedRevision: 0,
    sections: ENCOUNTER_SECTIONS,
  });
  const noteId = await world.provider.mutation(api.domains.mat.startFollowUp, {
    encounterId,
    episodeId: world.episodeId,
  });
  return { ...world, tx, frontDesk, encounterId, noteId };
}

test("signing enforces configured required sections and sets follow-up due", async () => {
  const world = await setupFollowUp();
  const { tx, provider, encounterId, noteId, episodeId } = world;
  const admin = await seedUser(tx, ["administrator"], "mat_fu_admin");
  await admin.mutation(api.domains.mat.setFollowUpConfig, {
    appointmentTypeId: world.appointmentTypeId,
    requiredSections: ["cravings", "risk", "plan"],
  });
  const dueAt = Date.parse("2026-09-01T17:00:00Z");
  await provider.mutation(api.domains.mat.saveFollowUp, {
    noteId,
    expectedRevision: 0,
    sections: { risk: "Synthetic risk", plan: "Synthetic plan" },
    nextFollowUpDueAt: dueAt,
  });
  await expect(
    provider.mutation(api.domains.encounters.signEncounter, {
      encounterId,
      signatureName: "Dr. Synthetic",
    }),
  ).rejects.toThrow('section "cravings" is required');

  await provider.mutation(api.domains.mat.saveFollowUp, {
    noteId,
    expectedRevision: 1,
    sections: {
      cravings: "Synthetic cravings note",
      risk: "Synthetic risk",
      plan: "Synthetic plan",
    },
    nextFollowUpDueAt: dueAt,
  });
  await provider.mutation(api.domains.encounters.signEncounter, {
    encounterId,
    signatureName: "Dr. Synthetic",
  });
  const note = await provider.query(api.domains.mat.getFollowUpForEncounter, {
    encounterId,
  });
  expect(note?.status).toBe("signed");
  const episode = await provider.query(api.domains.mat.getEpisode, {
    episodeId,
  });
  expect(episode?.nextFollowUpDueAt).toBe(dueAt);
  // Signed notes are locked.
  await expect(
    provider.mutation(api.domains.mat.saveFollowUp, {
      noteId,
      expectedRevision: 2,
      sections: { plan: "Forbidden edit" },
    }),
  ).rejects.toThrow("Signed notes cannot be edited");
});

test("medication plans supersede and follow-up links the active plan", async () => {
  const world = await setupFollowUp();
  const { tx, provider, episodeId, frontDesk } = world;
  const first = await provider.mutation(api.domains.mat.setMedicationPlan, {
    episodeId,
    medication: "Synthetic med A",
    dose: "1 unit",
    frequency: "daily",
  });
  await provider.mutation(api.domains.mat.setMedicationPlan, {
    episodeId,
    medication: "Synthetic med B",
    dose: "2 units",
    frequency: "daily",
  });
  const plans = await tx.run((ctx) =>
    ctx.db
      .query("matMedicationPlans")
      .withIndex("by_episode", (q) => q.eq("episodeId", episodeId))
      .collect(),
  );
  expect(plans.find((p) => p._id === first)?.status).toBe("superseded");
  expect(plans.filter((p) => p.status === "active")).toHaveLength(1);
  // Front desk cannot see or write MAT follow-up detail.
  await expect(
    frontDesk.query(api.domains.mat.getFollowUpForEncounter, {
      encounterId: world.encounterId,
    }),
  ).rejects.toThrow("Not authorized");
  await expect(
    frontDesk.mutation(api.domains.mat.setMedicationPlan, {
      episodeId,
      medication: "x",
      dose: "x",
      frequency: "x",
    }),
  ).rejects.toThrow("Not authorized");
});
