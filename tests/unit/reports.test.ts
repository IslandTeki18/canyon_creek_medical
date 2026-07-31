// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { zonedTimeToUtc } from "../../convex/lib/time";
import { MAX_RANGE_DAYS, toCsv } from "../../convex/lib/reports";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedPatients } from "../fixtures/patients";
import { seedSchedulingWorld, TZ } from "../fixtures/scheduling";

const modules = import.meta.glob("../../convex/**/*.ts");

const DAY_ONE = "2026-08-03";
const DAY_TWO = "2026-08-04";

async function setup() {
  const tx = convexTest(schema, modules);
  const world = await seedSchedulingWorld(tx);
  const [patientId, otherPatientId] = await seedPatients(tx);
  const admin = await seedUser(tx, ["administrator"], "rep_admin");
  const auditor = await seedUser(tx, ["auditor"], "rep_auditor");

  await tx.run(async (ctx) => {
    const base = {
      appointmentTypeId: world.appointmentTypeId,
      providerId: world.providerId,
      locationId: world.locationId,
      timeZone: TZ,
      createdByUserId: world.providerUserId,
      createdAt: 0,
      updatedAt: 0,
    };
    const at = (date: string, hour: number) =>
      zonedTimeToUtc(date, hour * 60, TZ)!;
    for (const [date, hour, status] of [
      [DAY_ONE, 9, "completed"],
      [DAY_ONE, 10, "noShow"],
      [DAY_ONE, 11, "cancelled"],
      [DAY_TWO, 9, "completed"],
      // Outside the reported range.
      ["2026-09-10", 9, "completed"],
    ] as const) {
      await ctx.db.insert("appointments", {
        ...base,
        patientId: hour % 2 === 0 ? otherPatientId! : patientId!,
        startAt: at(date, hour),
        endAt: at(date, hour) + 3_600_000,
        status,
      });
    }
  });
  return { tx, world, admin, auditor };
}

test("appointment outcomes bucket by day and stay inside the range", async () => {
  const { admin } = await setup();
  const report = await admin.query(api.domains.reporting.runReport, {
    report: "appointmentOutcomes",
    from: DAY_ONE,
    to: DAY_TWO,
  });
  expect(report.rows.map((row) => row.bucket)).toEqual([DAY_ONE, DAY_TWO]);
  expect(report.rows[0]?.metrics).toEqual({
    total: 3,
    completed: 1,
    noShow: 1,
    cancelled: 1,
  });
  expect(report.rows[1]?.metrics).toEqual({ total: 1, completed: 1 });
  expect(report.truncated).toBe(false);

  // Rows are buckets and counts — no patient identifier is present.
  expect(JSON.stringify(report)).not.toMatch(/Testerson|Sampleton|patients/);
});

test("service utilization filters by service key", async () => {
  const { admin } = await setup();
  const report = await admin.query(api.domains.reporting.runReport, {
    report: "serviceUtilization",
    from: DAY_ONE,
    to: DAY_TWO,
    serviceKey: "general",
  });
  expect(report.rows).toEqual([
    { bucket: "Follow-up", metrics: { booked: 4, completed: 2, noShow: 1 } },
  ]);
  await expect(
    admin.query(api.domains.reporting.runReport, {
      report: "serviceUtilization",
      from: DAY_ONE,
      to: DAY_TWO,
      serviceKey: "nope",
    }),
  ).rejects.toThrow("Unknown service key");
});

test("range and report validation protect the deployment", async () => {
  const { admin } = await setup();
  await expect(
    admin.query(api.domains.reporting.runReport, {
      report: "notAReport",
      from: DAY_ONE,
      to: DAY_TWO,
    }),
  ).rejects.toThrow("Unknown report");
  await expect(
    admin.query(api.domains.reporting.runReport, {
      report: "appointmentOutcomes",
      from: DAY_TWO,
      to: DAY_ONE,
    }),
  ).rejects.toThrow("range ends before it starts");
  await expect(
    admin.query(api.domains.reporting.runReport, {
      report: "appointmentOutcomes",
      from: "2020-01-01",
      to: DAY_TWO,
    }),
  ).rejects.toThrow(`cannot exceed ${MAX_RANGE_DAYS} days`);
});

test("export is separately capability-gated and audited with its scope", async () => {
  const { tx, admin, auditor } = await setup();
  // Auditors may read aggregates but never export.
  await admin.query(api.domains.reporting.runReport, {
    report: "appointmentOutcomes",
    from: DAY_ONE,
    to: DAY_TWO,
  });
  await auditor.query(api.domains.reporting.runReport, {
    report: "appointmentOutcomes",
    from: DAY_ONE,
    to: DAY_TWO,
  });
  await expect(
    auditor.mutation(api.domains.reporting.exportReport, {
      report: "appointmentOutcomes",
      from: DAY_ONE,
      to: DAY_TWO,
      reason: "Quality review",
    }),
  ).rejects.toThrow("Not authorized");
  await expect(
    admin.mutation(api.domains.reporting.exportReport, {
      report: "appointmentOutcomes",
      from: DAY_ONE,
      to: DAY_TWO,
      reason: "   ",
    }),
  ).rejects.toThrow("A reason is required");

  const result = await admin.mutation(api.domains.reporting.exportReport, {
    report: "appointmentOutcomes",
    from: DAY_ONE,
    to: DAY_TWO,
    reason: "Monthly operations review",
  });
  expect(result.fileName).toBe(
    `appointmentOutcomes-${DAY_ONE}-to-${DAY_TWO}.csv`,
  );
  expect(result.rowCount).toBe(2);
  expect(result.csv.split("\n")[0]).toBe(
    "bucket,scheduled,completed,cancelled,noShow,total",
  );
  expect(result.csv).toContain(`${DAY_ONE},0,1,1,1,3`);

  const audit = await tx.run(async (ctx) =>
    (await ctx.db.query("auditEvents").collect()).filter(
      (event) => event.action === "report.exported",
    ),
  );
  expect(audit).toHaveLength(1);
  expect(audit[0]?.reason).toContain("Monthly operations review");
  expect(audit[0]?.reason).toContain(`scope=${DAY_ONE}..${DAY_TWO}`);
  expect(audit[0]?.reason).toContain("rows=2");
});

test("csv quoting survives separators in a bucket label", () => {
  const csv = toCsv({
    key: "reminderDelivery",
    from: DAY_ONE,
    to: DAY_TWO,
    columns: ["total"],
    rows: [{ bucket: 'reminder, "email"', metrics: { total: 2 } }],
    truncated: false,
  });
  expect(csv).toBe('bucket,total\n"reminder, ""email""",2');
});
