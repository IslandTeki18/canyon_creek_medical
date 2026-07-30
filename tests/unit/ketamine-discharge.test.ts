// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedReadySession } from "../fixtures/ketamine";

const modules = import.meta.glob("../../convex/**/*.ts");

async function toRecovery(
  world: Awaited<ReturnType<typeof seedReadySession>>["world"],
  sessionId: Awaited<ReturnType<typeof seedReadySession>>["sessionId"],
) {
  await world.clinicalStaff.mutation(api.domains.ketamine.startSession, {
    sessionId,
  });
  await world.clinicalStaff.mutation(api.domains.ketamine.moveToRecovery, {
    sessionId,
  });
}

const validDischarge = {
  metCriteriaKeys: ["vitalsStable", "orientedAmbulatory"],
  recoveryAssessment: "Recovered per protocol",
  escortConfirmed: true,
  patientInstructions: "Rest today. No driving for 24 hours.",
};

test("completion requires a discharge record with met criteria", async () => {
  const tx = convexTest(schema, modules);
  const { world, sessionId } = await seedReadySession(tx);
  await toRecovery(world, sessionId);

  // Clinician cannot discharge with unmet criteria or missing final vitals.
  await expect(
    world.provider.mutation(api.domains.ketamine.recordDischarge, {
      sessionId,
      ...validDischarge,
      metCriteriaKeys: ["vitalsStable"],
    }),
  ).rejects.toThrow("Cannot discharge");
  await world.clinicalStaff.mutation(api.domains.ketamine.recordVitals, {
    sessionId,
    phase: "discharge",
    systolic: 118,
    diastolic: 76,
    heartRate: 70,
  });
  await world.provider.mutation(api.domains.ketamine.recordDischarge, {
    sessionId,
    ...validDischarge,
    followUpPlan: "Provider to schedule follow-up in one week",
  });
  const session = await tx.run((ctx) => ctx.db.get(sessionId));
  expect(session?.state).toBe("completed");
  expect(session?.endedAt).toBeDefined();
  // Second discharge is rejected — the record is immutable and singular.
  await expect(
    world.provider.mutation(api.domains.ketamine.recordDischarge, {
      sessionId,
      ...validDischarge,
    }),
  ).rejects.toThrow("Only a session in recovery can be discharged");
});

test("discharge override needs a reason and is audited; staff cannot discharge", async () => {
  const tx = convexTest(schema, modules);
  const { world, sessionId } = await seedReadySession(tx);
  await toRecovery(world, sessionId);
  await expect(
    world.clinicalStaff.mutation(api.domains.ketamine.recordDischarge, {
      sessionId,
      ...validDischarge,
    }),
  ).rejects.toThrow("Not authorized");
  await world.provider.mutation(api.domains.ketamine.recordDischarge, {
    sessionId,
    ...validDischarge,
    metCriteriaKeys: [],
    escortConfirmed: false,
    overrideReason: "Transfer to accompanying clinician per policy",
  });
  const audit = await tx.run((ctx) =>
    ctx.db
      .query("auditEvents")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "ketamineSessions").eq("entityId", sessionId),
      )
      .collect(),
  );
  expect(audit.some((e) => e.action === "ketamine.discharge.override")).toBe(
    true,
  );
});

test("patients see only their own published discharge instructions", async () => {
  const tx = convexTest(schema, modules);
  const { world, sessionId } = await seedReadySession(tx);
  await toRecovery(world, sessionId);
  await world.clinicalStaff.mutation(api.domains.ketamine.recordVitals, {
    sessionId,
    phase: "discharge",
    systolic: 118,
    diastolic: 76,
    heartRate: 70,
  });
  await world.provider.mutation(api.domains.ketamine.recordDischarge, {
    sessionId,
    ...validDischarge,
  });

  const patientUser = await seedUser(tx, ["patient"], "ket_patient");
  const strangerUser = await seedUser(tx, ["patient"], "ket_stranger");
  await tx.run(async (ctx) => {
    const owner = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", "ket_patient"))
      .unique();
    await ctx.db.insert("patientAccountLinks", {
      patientId: world.patientId,
      userId: owner!._id,
      relationshipType: "self",
      status: "active",
      verificationMethod: "invitation",
      createdAt: 0,
      updatedAt: 0,
    });
  });
  const mine = await patientUser.query(
    api.domains.ketamine.listMyDischargeInstructions,
    {},
  );
  expect(mine).toHaveLength(1);
  expect(mine[0]?.instructions).toContain("No driving");
  await expect(
    strangerUser.query(api.domains.ketamine.listMyDischargeInstructions, {}),
  ).rejects.toThrow("No linked patient record");
});
