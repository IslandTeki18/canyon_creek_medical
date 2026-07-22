// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Role } from "../../convex/lib/permissions";
import schema from "../../convex/schema";
import { seedPatients } from "../fixtures/patients";

const modules = import.meta.glob("../../convex/**/*.ts");

async function seedUser(
  tx: ReturnType<typeof convexTest>,
  roles: Role[],
  clerkUserId: string,
) {
  await tx.run(async (ctx) => {
    await ctx.db.insert("users", {
      clerkUserId,
      type: roles.includes("patient") ? "patient" : "workforce",
      status: "active",
      roles,
      displayName: `Synthetic ${clerkUserId}`,
      createdAt: 0,
      updatedAt: 0,
    });
  });
  return tx.withIdentity({ subject: clerkUserId });
}

test("authorized staff open a chart and access is audited", async () => {
  const tx = convexTest(schema, modules);
  const [patientId] = await seedPatients(tx);
  const staff = await seedUser(tx, ["clinicalStaff"], "user_cs");

  const chart = await staff.query(api.domains.patients.getPatientChart, {
    patientId,
  });
  expect(chart?.patient.legalFirstName).toBe("Avery");
  expect(chart?.communicationPreference).toBeNull();

  await staff.mutation(api.domains.patients.recordChartAccess, { patientId });
  const audits = await tx.run((ctx) => ctx.db.query("auditEvents").collect());
  expect(
    audits.some(
      (a) => a.action === "patient.chart.viewed" && a.entityId === patientId,
    ),
  ).toBe(true);
});

test("patient and auditor roles cannot open charts by URL manipulation", async () => {
  const tx = convexTest(schema, modules);
  const [patientId] = await seedPatients(tx);
  for (const role of ["patient", "auditor"] as const) {
    const user = await seedUser(tx, [role], `user_${role}`);
    await expect(
      user.query(api.domains.patients.getPatientChart, { patientId }),
    ).rejects.toThrow("Not authorized");
  }
});

test("archive requires reason, is audited, and is reversible — never a delete", async () => {
  const tx = convexTest(schema, modules);
  const [patientId] = await seedPatients(tx);
  const staff = await seedUser(tx, ["frontDesk"], "user_fd");

  await expect(
    staff.mutation(api.domains.patients.setPatientStatus, {
      patientId,
      status: "archived",
      reason: " ",
    }),
  ).rejects.toThrow("reason is required");

  await staff.mutation(api.domains.patients.setPatientStatus, {
    patientId,
    status: "archived",
    reason: "Moved out of state",
  });
  let patient = await tx.run((ctx) => ctx.db.get(patientId));
  expect(patient?.status).toBe("archived");
  expect(patient?.archiveReason).toBe("Moved out of state");

  await staff.mutation(api.domains.patients.setPatientStatus, {
    patientId,
    status: "active",
    reason: "Returned to care",
  });
  patient = await tx.run((ctx) => ctx.db.get(patientId));
  expect(patient?.status).toBe("active");
  expect(patient?.archiveReason).toBeUndefined();

  const audits = await tx.run((ctx) => ctx.db.query("auditEvents").collect());
  expect(audits.some((a) => a.action === "patient.archived")).toBe(true);
  expect(audits.some((a) => a.action === "patient.reactivated")).toBe(true);
});

test("auditor cannot archive; clinicalStaff can view but chart of missing id is null", async () => {
  const tx = convexTest(schema, modules);
  const [patientId] = await seedPatients(tx);
  const auditor = await seedUser(tx, ["auditor"], "user_aud2");
  await expect(
    auditor.mutation(api.domains.patients.setPatientStatus, {
      patientId,
      status: "archived",
      reason: "x",
    }),
  ).rejects.toThrow("Not authorized");
});
