// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedPatients } from "../fixtures/patients";

const modules = import.meta.glob("../../convex/**/*.ts");

async function seedWorld(tx: ReturnType<typeof convexTest>) {
  const clinical = await seedUser(tx, ["clinicalStaff"], "alert_clinical");
  const frontDesk = await seedUser(tx, ["frontDesk"], "alert_front_desk");
  const [patientId] = await seedPatients(tx);
  return { clinical, frontDesk, patientId: patientId! };
}

test("visibility scope decides who sees an alert", async () => {
  const tx = convexTest(schema, modules);
  const { clinical, frontDesk, patientId } = await seedWorld(tx);
  const careTeamOnly = await clinical.mutation(api.domains.alerts.createAlert, {
    patientId,
    type: "careCoordination",
    severity: "warning",
    message: "Coordinate with the care team before scheduling changes",
    visibility: "careTeam",
    reason: "Care coordination request",
  });
  const allStaff = await clinical.mutation(api.domains.alerts.createAlert, {
    patientId,
    type: "administrative",
    severity: "info",
    message: "Confirm contact details at each visit",
    visibility: "allStaff",
    reason: "Repeated failed contact attempts",
  });

  expect(
    (await clinical.query(api.domains.alerts.listActive, { patientId }))
      .map((a) => a._id)
      .sort(),
  ).toEqual([allStaff, careTeamOnly].sort());
  // Front desk sees the operational alert only.
  expect(
    (await frontDesk.query(api.domains.alerts.listActive, { patientId })).map(
      (a) => a._id,
    ),
  ).toEqual([allStaff]);
  // And cannot acknowledge one it may not read.
  await expect(
    frontDesk.mutation(api.domains.alerts.acknowledgeAlert, {
      alertId: careTeamOnly,
    }),
  ).rejects.toThrow("Not authorized");
});

test("only clinical roles author alerts; patients never read them", async () => {
  const tx = convexTest(schema, modules);
  const { clinical, frontDesk, patientId } = await seedWorld(tx);
  await expect(
    frontDesk.mutation(api.domains.alerts.createAlert, {
      patientId,
      type: "safety",
      severity: "critical",
      message: "Unauthorized",
      visibility: "allStaff",
      reason: "Should fail",
    }),
  ).rejects.toThrow("Not authorized");

  const alertId = await clinical.mutation(api.domains.alerts.createAlert, {
    patientId,
    type: "safety",
    severity: "critical",
    message: "Two-staff escort required for appointments",
    visibility: "allStaff",
    reason: "Documented safety plan",
  });
  const patient = await seedUser(tx, ["patient"], "alert_patient");
  await expect(
    patient.query(api.domains.alerts.listActive, { patientId }),
  ).rejects.toThrow("Not authorized");
  await expect(
    patient.mutation(api.domains.alerts.archiveAlert, {
      alertId,
      reason: "Nope",
    }),
  ).rejects.toThrow("Not authorized");
});

test("expired and archived alerts leave the header but stay in history", async () => {
  const tx = convexTest(schema, modules);
  const { clinical, patientId } = await seedWorld(tx);
  const now = Date.now();
  const expired = await clinical.mutation(api.domains.alerts.createAlert, {
    patientId,
    type: "administrative",
    severity: "info",
    message: "Temporary transport arrangement",
    visibility: "allStaff",
    reason: "Short-term arrangement",
    effectiveFrom: now - 20_000,
    effectiveTo: now - 10_000,
  });
  const archived = await clinical.mutation(api.domains.alerts.createAlert, {
    patientId,
    type: "safety",
    severity: "warning",
    message: "Escort required",
    visibility: "allStaff",
    reason: "Safety plan",
  });
  await clinical.mutation(api.domains.alerts.archiveAlert, {
    alertId: archived,
    reason: "Safety plan resolved",
  });

  expect(
    await clinical.query(api.domains.alerts.listActive, { patientId }),
  ).toEqual([]);
  const history = await clinical.query(api.domains.alerts.listHistory, {
    patientId,
  });
  expect(history.map((a) => a._id).sort()).toEqual([expired, archived].sort());
  expect(history.find((a) => a._id === archived)?.archiveReason).toBe(
    "Safety plan resolved",
  );
  // Archiving is not deletion, and it cannot be repeated.
  await expect(
    clinical.mutation(api.domains.alerts.archiveAlert, {
      alertId: archived,
      reason: "Again",
    }),
  ).rejects.toThrow("Alert is archived");
});

test("acknowledgement is per user and idempotent, and changes are audited", async () => {
  const tx = convexTest(schema, modules);
  const { clinical, frontDesk, patientId } = await seedWorld(tx);
  const alertId = await clinical.mutation(api.domains.alerts.createAlert, {
    patientId,
    type: "administrative",
    severity: "info",
    message: "Confirm contact details at each visit",
    visibility: "allStaff",
    reason: "Repeated failed contact attempts",
  });
  await clinical.mutation(api.domains.alerts.acknowledgeAlert, { alertId });
  await clinical.mutation(api.domains.alerts.acknowledgeAlert, { alertId });
  expect(
    (await clinical.query(api.domains.alerts.listActive, { patientId }))[0]
      ?.acknowledged,
  ).toBe(true);
  // Another user's acknowledgement is their own.
  expect(
    (await frontDesk.query(api.domains.alerts.listActive, { patientId }))[0]
      ?.acknowledged,
  ).toBe(false);
  expect(
    await tx.run(
      async (ctx) =>
        (await ctx.db.query("patientAlertAcknowledgements").collect()).length,
    ),
  ).toBe(1);

  await expect(
    clinical.mutation(api.domains.alerts.updateAlert, {
      alertId,
      severity: "warning",
      reason: "   ",
    }),
  ).rejects.toThrow("Reason is required");
  await clinical.mutation(api.domains.alerts.updateAlert, {
    alertId,
    severity: "warning",
    reason: "Escalated after a second missed contact",
  });

  const audit = await tx.run(async (ctx) =>
    (await ctx.db.query("auditEvents").collect()).map((e) => e.action),
  );
  expect(audit).toEqual(
    expect.arrayContaining([
      "alert.created",
      "alert.acknowledged",
      "alert.updated",
    ]),
  );
});
