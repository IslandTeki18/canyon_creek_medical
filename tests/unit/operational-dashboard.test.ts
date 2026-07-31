// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { zonedParts, zonedTimeToUtc } from "../../convex/lib/time";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedPatients } from "../fixtures/patients";
import { seedSchedulingWorld, TZ } from "../fixtures/scheduling";

const modules = import.meta.glob("../../convex/**/*.ts");

const DATE = "2026-08-03";
const NINE_AM = zonedTimeToUtc(DATE, 9 * 60, TZ)!;

function metric(
  dashboard: { metrics: { key: string; count: number }[] },
  key: string,
) {
  return dashboard.metrics.find((m) => m.key === key)?.count;
}

async function setup() {
  const tx = convexTest(schema, modules);
  const world = await seedSchedulingWorld(tx);
  const [patientId, otherPatientId] = await seedPatients(tx);
  const admin = await seedUser(tx, ["administrator"], "dash_admin");
  return {
    tx,
    world,
    patientId: patientId!,
    otherPatientId: otherPatientId!,
    admin,
  };
}

test("dashboard totals reconcile with the underlying records", async () => {
  const { tx, world, patientId, otherPatientId, admin } = await setup();
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
    await ctx.db.insert("appointments", {
      ...base,
      patientId,
      startAt: NINE_AM,
      endAt: NINE_AM + 3_600_000,
      status: "scheduled" as const,
    });
    await ctx.db.insert("appointments", {
      ...base,
      patientId: otherPatientId,
      startAt: NINE_AM + 3_600_000,
      endAt: NINE_AM + 7_200_000,
      status: "noShow" as const,
    });
    // A different day: must not be counted.
    await ctx.db.insert("appointments", {
      ...base,
      patientId,
      startAt: NINE_AM + 7 * 24 * 3_600_000,
      endAt: NINE_AM + 7 * 24 * 3_600_000 + 3_600_000,
      status: "scheduled" as const,
    });
    // Operational work behind the remaining metrics.
    await ctx.db.insert("documents", {
      patientId,
      category: "insurance",
      title: "Card",
      source: "patient" as const,
      visibility: "patient" as const,
      reviewStatus: "pending" as const,
      createdByUserId: world.providerUserId,
      createdAt: 0,
      updatedAt: 0,
    });
    await ctx.db.insert("tasks", {
      queueKey: "clinicalFollowUp",
      title: "Operational follow-up",
      priority: "normal" as const,
      status: "open" as const,
      createdByUserId: world.providerUserId,
      createdAt: 0,
      updatedAt: 0,
    });
    await ctx.db.insert("tasks", {
      queueKey: "clinicalFollowUp",
      title: "Already handled",
      priority: "normal" as const,
      status: "completed" as const,
      createdByUserId: world.providerUserId,
      createdAt: 0,
      updatedAt: 0,
    });
  });

  const dashboard = await admin.query(
    api.domains.reporting.operationalDashboard,
    { date: DATE },
  );
  expect(dashboard.date).toBe(DATE);
  expect(dashboard.timeZone).toBe(TZ);
  expect(metric(dashboard, "appointments")).toBe(2);
  expect(metric(dashboard, "unconfirmed")).toBe(1);
  expect(metric(dashboard, "noShows")).toBe(1);
  expect(metric(dashboard, "pendingDocuments")).toBe(1);
  expect(metric(dashboard, "unresolvedTasks")).toBe(1);
  // Two distinct patients on the schedule, neither with intake complete.
  expect(metric(dashboard, "notReady")).toBe(2);

  // Aggregates only: no patient identity leaves this query.
  expect(JSON.stringify(dashboard)).not.toMatch(/Testerson|Sampleton/);
  // Every metric points at the queue that explains it.
  for (const item of dashboard.metrics) {
    expect(item.link).toMatch(/^\/app\//);
  }
});

test("provider and location filters narrow the day", async () => {
  const { tx, world, patientId, admin } = await setup();
  const otherProviderId = await tx.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkUserId: "dash_other_provider",
      type: "workforce" as const,
      status: "active" as const,
      roles: ["provider" as const],
      displayName: "Dr. Other",
      createdAt: 0,
      updatedAt: 0,
    });
    const providerId = await ctx.db.insert("providers", {
      userId,
      displayName: "Dr. Other",
      status: "active" as const,
      createdAt: 0,
      updatedAt: 0,
    });
    await ctx.db.insert("appointments", {
      patientId,
      appointmentTypeId: world.appointmentTypeId,
      providerId,
      locationId: world.locationId,
      startAt: NINE_AM,
      endAt: NINE_AM + 3_600_000,
      timeZone: TZ,
      status: "confirmed" as const,
      createdByUserId: world.providerUserId,
      createdAt: 0,
      updatedAt: 0,
    });
    return providerId;
  });

  const all = await admin.query(api.domains.reporting.operationalDashboard, {
    date: DATE,
  });
  expect(metric(all, "appointments")).toBe(1);
  const filtered = await admin.query(
    api.domains.reporting.operationalDashboard,
    { date: DATE, providerId: world.providerId },
  );
  expect(metric(filtered, "appointments")).toBe(0);
  const byOther = await admin.query(
    api.domains.reporting.operationalDashboard,
    { date: DATE, providerId: otherProviderId },
  );
  expect(metric(byOther, "appointments")).toBe(1);
});

test("the dashboard requires report.view and validates the date", async () => {
  const { admin, tx } = await setup();
  const frontDesk = await seedUser(tx, ["frontDesk"], "dash_front_desk");
  await expect(
    frontDesk.query(api.domains.reporting.operationalDashboard, {}),
  ).rejects.toThrow("Not authorized");
  await expect(
    admin.query(api.domains.reporting.operationalDashboard, {
      date: "not-a-date",
    }),
  ).rejects.toThrow("Date must be YYYY-MM-DD");
  // With no date the dashboard reports today in the location's time zone.
  const today = await admin.query(
    api.domains.reporting.operationalDashboard,
    {},
  );
  expect(today.date).toBe(zonedParts(Date.now(), TZ).date);
});
