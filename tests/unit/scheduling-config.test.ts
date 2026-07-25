// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedSchedulingWorld, TZ } from "../fixtures/scheduling";

const modules = import.meta.glob("../../convex/**/*.ts");

test("configuration requires config.manage; front desk may read but not write", async () => {
  const tx = convexTest(schema, modules);
  await seedSchedulingWorld(tx);
  const frontDesk = await seedUser(tx, ["frontDesk"], "user_fd");
  const patient = await seedUser(tx, ["patient"], "user_pt");

  expect(
    await frontDesk.query(api.domains.scheduling.listLocations, {}),
  ).toHaveLength(1);
  await expect(
    frontDesk.mutation(api.domains.scheduling.createLocation, {
      name: "Annex",
      timeZone: TZ,
    }),
  ).rejects.toThrow("Not authorized");
  await expect(
    patient.query(api.domains.scheduling.listLocations, {}),
  ).rejects.toThrow("Not authorized");
});

test("locations reject unknown time zones and archiving with active types", async () => {
  const tx = convexTest(schema, modules);
  const world = await seedSchedulingWorld(tx);
  const admin = await seedUser(tx, ["administrator"], "user_admin");

  await expect(
    admin.mutation(api.domains.scheduling.createLocation, {
      name: "Annex",
      timeZone: "Mars/Olympus",
    }),
  ).rejects.toThrow("Unknown time zone");

  await expect(
    admin.mutation(api.domains.scheduling.setLocationStatus, {
      locationId: world.locationId,
      status: "archived",
      reason: "Closing",
    }),
  ).rejects.toThrow("appointment types first");
});

test("appointment types validate duration, buffers, and eligible providers", async () => {
  const tx = convexTest(schema, modules);
  const world = await seedSchedulingWorld(tx);
  const admin = await seedUser(tx, ["administrator"], "user_admin");
  const base = {
    serviceId: world.serviceId,
    locationId: world.locationId,
    name: "Intake visit",
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 15,
    eligibleProviderIds: [world.providerId],
  };

  await expect(
    admin.mutation(api.domains.scheduling.createAppointmentType, {
      ...base,
      key: "intakeVisit",
      durationMinutes: 0,
    }),
  ).rejects.toThrow("positive whole number");
  await expect(
    admin.mutation(api.domains.scheduling.createAppointmentType, {
      ...base,
      key: "intakeVisit",
      durationMinutes: 60,
      eligibleProviderIds: [],
    }),
  ).rejects.toThrow("At least one eligible provider");
  await expect(
    admin.mutation(api.domains.scheduling.createAppointmentType, {
      ...base,
      key: "followUp", // already used by the fixture
      durationMinutes: 60,
    }),
  ).rejects.toThrow("appointment type with that key exists");

  const typeId = await admin.mutation(
    api.domains.scheduling.createAppointmentType,
    { ...base, key: "intakeVisit", durationMinutes: 90 },
  );
  const types = await admin.query(
    api.domains.scheduling.listAppointmentTypes,
    {},
  );
  const created = types.find((t) => t._id === typeId);
  expect(created?.durationMinutes).toBe(90);
  expect(created?.patientSelfSchedulable).toBe(false);
  expect(created?.providerNames).toEqual(["Dr. Synthetic"]);
});

test("availability rejects contradictory and overlapping configuration", async () => {
  const tx = convexTest(schema, modules);
  const world = await seedSchedulingWorld(tx);
  const admin = await seedUser(tx, ["administrator"], "user_admin");
  const base = {
    providerId: world.providerId,
    locationId: world.locationId,
    startMinute: 10 * 60,
    endMinute: 12 * 60,
  };

  await expect(
    admin.mutation(api.domains.scheduling.createAvailabilityRule, {
      ...base,
      weekday: 1,
      date: "2026-08-03",
    }),
  ).rejects.toThrow("either a weekday or a specific date");
  await expect(
    admin.mutation(api.domains.scheduling.createAvailabilityRule, {
      ...base,
      weekday: 1,
      startMinute: 12 * 60,
      endMinute: 10 * 60,
    }),
  ).rejects.toThrow("Start must be before end");
  // Monday 09:00–17:00 already exists in the fixture.
  await expect(
    admin.mutation(api.domains.scheduling.createAvailabilityRule, {
      ...base,
      weekday: 1,
    }),
  ).rejects.toThrow("overlaps an existing availability rule");

  // Non-overlapping minutes on the same weekday are fine.
  const ruleId = await admin.mutation(
    api.domains.scheduling.createAvailabilityRule,
    { ...base, weekday: 1, startMinute: 18 * 60, endMinute: 20 * 60 },
  );
  await admin.mutation(api.domains.scheduling.deactivateAvailabilityRule, {
    ruleId,
    reason: "Evening clinic cancelled",
  });
  const after = await admin.query(api.domains.scheduling.listAvailability, {
    providerId: world.providerId,
  });
  expect(after.rules.some((r) => r._id === ruleId)).toBe(false);
});

test("time off rejects inverted and overlapping intervals and is audited", async () => {
  const tx = convexTest(schema, modules);
  const world = await seedSchedulingWorld(tx);
  const admin = await seedUser(tx, ["administrator"], "user_admin");
  const start = Date.UTC(2026, 7, 4, 15, 0);
  const end = Date.UTC(2026, 7, 4, 20, 0);

  await expect(
    admin.mutation(api.domains.scheduling.createTimeOff, {
      providerId: world.providerId,
      startAt: end,
      endAt: start,
      reason: "Backwards",
    }),
  ).rejects.toThrow("ends before it starts");

  await admin.mutation(api.domains.scheduling.createTimeOff, {
    providerId: world.providerId,
    startAt: start,
    endAt: end,
    reason: "Continuing education",
  });
  await expect(
    admin.mutation(api.domains.scheduling.createTimeOff, {
      providerId: world.providerId,
      startAt: start + 60_000,
      endAt: end,
      reason: "Duplicate",
    }),
  ).rejects.toThrow("overlaps existing time off");

  const audits = await tx.run((ctx) => ctx.db.query("auditEvents").collect());
  expect(
    audits.filter((a) => a.action.startsWith("scheduling.")).length,
  ).toBeGreaterThan(0);
});
