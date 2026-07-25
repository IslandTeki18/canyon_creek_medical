// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import {
  allowedTransitions,
  canTransition,
  occupiesSlot,
} from "../../convex/lib/scheduling";
import {
  addDays,
  datesBetween,
  zonedParts,
  zonedTimeToUtc,
} from "../../convex/lib/time";
import schema from "../../convex/schema";
import { seedPatients } from "../fixtures/patients";
import { seedSchedulingWorld, TZ } from "../fixtures/scheduling";

describe("lifecycle transitions", () => {
  test("permits the documented path and rejects everything else", () => {
    expect(canTransition("scheduled", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "checkedIn")).toBe(true);
    expect(canTransition("checkedIn", "inProgress")).toBe(true);
    expect(canTransition("inProgress", "completed")).toBe(true);

    expect(canTransition("completed", "scheduled")).toBe(false);
    expect(canTransition("cancelled", "confirmed")).toBe(false);
    expect(canTransition("noShow", "checkedIn")).toBe(false);
    expect(canTransition("scheduled", "inProgress")).toBe(false);
    expect(allowedTransitions("completed")).toHaveLength(0);
  });

  test("only non-terminal-negative statuses hold the slot", () => {
    expect(occupiesSlot("scheduled")).toBe(true);
    expect(occupiesSlot("completed")).toBe(true);
    expect(occupiesSlot("cancelled")).toBe(false);
    expect(occupiesSlot("noShow")).toBe(false);
  });
});

describe("time zone conversion", () => {
  test("round-trips local wall clock across a DST boundary", () => {
    // 2026-03-08 is spring-forward in America/Denver (MST -07 → MDT -06).
    const before = zonedTimeToUtc("2026-03-07", 9 * 60, TZ);
    const after = zonedTimeToUtc("2026-03-09", 9 * 60, TZ);
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(new Date(before!).toISOString()).toBe("2026-03-07T16:00:00.000Z");
    expect(new Date(after!).toISOString()).toBe("2026-03-09T15:00:00.000Z");
    expect(zonedParts(after!, TZ)).toEqual({
      date: "2026-03-09",
      minutes: 540,
      weekday: 1,
    });
  });

  test("returns null for a wall-clock time that does not exist", () => {
    // 02:30 never happens on the spring-forward day.
    expect(zonedTimeToUtc("2026-03-08", 2 * 60 + 30, TZ)).toBeNull();
    expect(zonedTimeToUtc("2026-03-08", 3 * 60, TZ)).not.toBeNull();
  });

  test("resolves the ambiguous fall-back hour to the earlier instant", () => {
    // 2026-11-01: 01:30 occurs twice in America/Denver.
    const utc = zonedTimeToUtc("2026-11-01", 90, TZ);
    expect(new Date(utc!).toISOString()).toBe("2026-11-01T07:30:00.000Z");
  });

  test("date helpers ignore time zones", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(datesBetween("2026-03-07", "2026-03-09")).toEqual([
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
    ]);
  });
});

test("schema represents recurring and one-time availability, time off, appointments, and resources", async () => {
  const tx = convexTest(schema, import.meta.glob("../../convex/**/*.ts"));
  const [patientId] = await seedPatients(tx);
  const world = await seedSchedulingWorld(tx);

  const startAt = zonedTimeToUtc("2026-08-03", 10 * 60, TZ)!;
  await tx.run(async (ctx) => {
    await ctx.db.insert("availabilityRules", {
      providerId: world.providerId,
      locationId: world.locationId,
      date: "2026-08-08", // one-time Saturday clinic
      startMinute: 8 * 60,
      endMinute: 12 * 60,
      active: true,
      createdAt: 0,
      updatedAt: 0,
    });
    await ctx.db.insert("timeOff", {
      providerId: world.providerId,
      startAt: zonedTimeToUtc("2026-08-04", 0, TZ)!,
      endAt: zonedTimeToUtc("2026-08-05", 0, TZ)!,
      reason: "Continuing education",
      createdByUserId: world.providerUserId,
      createdAt: 0,
    });
    const resourceId = await ctx.db.insert("resources", {
      locationId: world.locationId,
      name: "Infusion Room 1",
      type: "room",
      status: "active",
      createdAt: 0,
      updatedAt: 0,
    });
    const appointmentId = await ctx.db.insert("appointments", {
      patientId,
      appointmentTypeId: world.appointmentTypeId,
      providerId: world.providerId,
      locationId: world.locationId,
      startAt,
      endAt: startAt + 60 * 60_000,
      timeZone: TZ,
      status: "scheduled",
      resourceIds: [resourceId],
      createdByUserId: world.providerUserId,
      createdAt: 0,
      updatedAt: 0,
    });
    await ctx.db.insert("appointmentEvents", {
      appointmentId,
      toStatus: "scheduled",
      actorUserId: world.providerUserId,
      createdAt: 0,
    });
  });

  const byProvider = await tx.run((ctx) =>
    ctx.db
      .query("appointments")
      .withIndex("by_provider_start", (q) =>
        q.eq("providerId", world.providerId).gte("startAt", startAt),
      )
      .collect(),
  );
  expect(byProvider).toHaveLength(1);
  expect(byProvider[0].timeZone).toBe(TZ);

  const rules = await tx.run((ctx) =>
    ctx.db
      .query("availabilityRules")
      .withIndex("by_provider", (q) =>
        q.eq("providerId", world.providerId).eq("active", true),
      )
      .collect(),
  );
  expect(rules.filter((r) => r.date !== undefined)).toHaveLength(1);
  expect(rules.filter((r) => r.weekday !== undefined)).toHaveLength(5);
});
