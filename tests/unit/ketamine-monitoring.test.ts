// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { seedReadySession } from "../fixtures/ketamine";

const modules = import.meta.glob("../../convex/**/*.ts");

test("session timeline reconstructs from stored records", async () => {
  const tx = convexTest(schema, modules);
  const { world, sessionId } = await seedReadySession(tx);
  const { clinicalStaff } = world;

  // Hard stop: a planned session cannot start (only ready).
  const otherSession = await world.provider.mutation(
    api.domains.ketamine.createSession,
    { courseId: world.courseId },
  );
  await expect(
    clinicalStaff.mutation(api.domains.ketamine.startSession, {
      sessionId: otherSession,
    }),
  ).rejects.toThrow("Only a ready session can be started");

  await clinicalStaff.mutation(api.domains.ketamine.startSession, {
    sessionId,
  });
  await clinicalStaff.mutation(api.domains.ketamine.addObservation, {
    sessionId,
    kind: "medicationAdministration",
    text: "Infusion started",
    medication: "Ketamine",
    dose: "0.5 mg/kg",
    route: "IV",
  });
  await clinicalStaff.mutation(api.domains.ketamine.recordVitals, {
    sessionId,
    phase: "monitoring",
    systolic: 132,
    diastolic: 84,
    heartRate: 88,
  });
  await clinicalStaff.mutation(api.domains.ketamine.addObservation, {
    sessionId,
    kind: "observation",
    text: "Patient comfortable, mild dissociation",
  });
  await clinicalStaff.mutation(api.domains.ketamine.recordAdverseEvent, {
    sessionId,
    description: "Transient nausea",
    severity: "mild",
    actionsTaken: "Ondansetron per protocol, resolved",
  });
  await clinicalStaff.mutation(api.domains.ketamine.moveToRecovery, {
    sessionId,
  });

  // Fresh read (as after a browser refresh) reconstructs everything.
  const detail = await clinicalStaff.query(api.domains.ketamine.getSession, {
    sessionId,
  });
  expect(detail?.session.state).toBe("recovery");
  expect(detail?.session.startedAt).toBeDefined();
  expect(detail?.session.startedByUserId).toBeDefined();
  expect(detail?.vitals.map((v) => v.phase)).toEqual([
    "baseline",
    "monitoring",
  ]);
  expect(detail?.observations.map((o) => o.kind)).toEqual([
    "medicationAdministration",
    "observation",
  ]);
  expect(detail?.adverseEvents).toHaveLength(1);
  expect(detail?.vitals.every((v) => v.recorderUserId)).toBe(true);
});

test("monitoring entries reject closed sessions and require content", async () => {
  const tx = convexTest(schema, modules);
  const { world, sessionId } = await seedReadySession(tx);
  await expect(
    world.clinicalStaff.mutation(api.domains.ketamine.addObservation, {
      sessionId,
      kind: "observation",
      text: "Too early",
    }),
  ).rejects.toThrow("Session is not in progress");
  await world.clinicalStaff.mutation(api.domains.ketamine.startSession, {
    sessionId,
  });
  await expect(
    world.clinicalStaff.mutation(api.domains.ketamine.addObservation, {
      sessionId,
      kind: "medicationAdministration",
      text: "Dose given",
    }),
  ).rejects.toThrow("Medication name is required");
  await world.clinicalStaff.mutation(api.domains.ketamine.moveToRecovery, {
    sessionId,
  });
  await expect(
    world.clinicalStaff.mutation(api.domains.ketamine.moveToRecovery, {
      sessionId,
    }),
  ).rejects.toThrow("Only an in-progress session can enter recovery");
});
