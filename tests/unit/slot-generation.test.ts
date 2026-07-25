// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { generateSlots, type SlotInputs } from "../../convex/lib/slots";
import { zonedTimeToUtc } from "../../convex/lib/time";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedPatients } from "../fixtures/patients";
import { seedSchedulingWorld, TZ } from "../fixtures/scheduling";

const modules = import.meta.glob("../../convex/**/*.ts");

function inputs(overrides: Partial<SlotInputs> = {}): SlotInputs {
  return {
    timeZone: TZ,
    fromDate: "2026-08-03", // a Monday
    toDate: "2026-08-03",
    durationMinutes: 60,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    rules: [{ weekday: 1, startMinute: 9 * 60, endMinute: 12 * 60 }],
    busy: [],
    ...overrides,
  };
}

describe("generateSlots", () => {
  test("is deterministic and respects the availability window", () => {
    const first = generateSlots(inputs());
    const second = generateSlots(inputs());
    expect(first).toEqual(second);
    expect(first.map((s) => s.localTime)).toEqual(["09:00", "10:00", "11:00"]);
    // A 45-minute visit packs four slots into 09:00–12:00 and never offers
    // one that would run past the window.
    expect(
      generateSlots(inputs({ durationMinutes: 45 })).map((s) => s.localTime),
    ).toEqual(["09:00", "09:45", "10:30", "11:15"]);
  });

  test("buffers widen the step and the blocked footprint", () => {
    expect(
      generateSlots(inputs({ bufferAfterMinutes: 30 })).map((s) => s.localTime),
    ).toEqual(["09:00", "10:30"]);

    // A 10:00 appointment blocks the 09:00 slot too, once a 30-minute
    // after-buffer is required between appointments.
    const busyStart = zonedTimeToUtc("2026-08-03", 10 * 60, TZ)!;
    const blocked = generateSlots(
      inputs({
        bufferAfterMinutes: 30,
        busy: [{ startAt: busyStart, endAt: busyStart + 3_600_000 }],
      }),
    );
    expect(blocked).toHaveLength(0);
  });

  test("never overlaps blocked time or an existing appointment", () => {
    const busyStart = zonedTimeToUtc("2026-08-03", 10 * 60, TZ)!;
    const slots = generateSlots(
      inputs({ busy: [{ startAt: busyStart, endAt: busyStart + 3_600_000 }] }),
    );
    expect(slots.map((s) => s.localTime)).toEqual(["09:00", "11:00"]);
    for (const slot of slots) {
      expect(
        slot.startAt < busyStart + 3_600_000 && busyStart < slot.endAt,
      ).toBe(false);
    }
  });

  test("skips wall-clock times erased by spring-forward", () => {
    // 2026-03-08 (Sunday): 02:00–03:00 local does not exist in Denver.
    const slots = generateSlots(
      inputs({
        fromDate: "2026-03-08",
        toDate: "2026-03-08",
        rules: [{ weekday: 0, startMinute: 60, endMinute: 5 * 60 }],
      }),
    );
    expect(slots.map((s) => s.localTime)).toEqual(["01:00", "03:00", "04:00"]);
    // Real elapsed time still separates them: 01:00 MST → 03:00 MDT is 1 hour.
    expect(slots[1]!.startAt - slots[0]!.startAt).toBe(3_600_000);
  });

  test("keeps the extra hour created by fall-back", () => {
    // 2026-11-01 (Sunday): 01:00–02:00 local happens twice; the window
    // 00:00–04:00 local is five real hours long.
    const slots = generateSlots(
      inputs({
        fromDate: "2026-11-01",
        toDate: "2026-11-01",
        rules: [{ weekday: 0, startMinute: 0, endMinute: 4 * 60 }],
      }),
    );
    expect(slots.map((s) => s.localTime)).toEqual([
      "00:00",
      "01:00",
      "02:00",
      "03:00",
    ]);
    const last = slots[slots.length - 1]!;
    expect(last.endAt - slots[0]!.startAt).toBe(5 * 3_600_000);
  });

  test("honours effective dates and one-time availability", () => {
    const rules = [
      {
        weekday: 1,
        startMinute: 9 * 60,
        endMinute: 10 * 60,
        effectiveTo: "2026-08-02",
      },
      { date: "2026-08-03", startMinute: 13 * 60, endMinute: 14 * 60 },
    ];
    expect(generateSlots(inputs({ rules })).map((s) => s.localTime)).toEqual([
      "13:00",
    ]);
  });
});

test("listAvailableSlots is server-side, bounded, and authorized", async () => {
  const tx = convexTest(schema, modules);
  const world = await seedSchedulingWorld(tx);
  const [patientId] = await seedPatients(tx);
  const frontDesk = await seedUser(tx, ["frontDesk"], "user_fd");
  const patient = await seedUser(tx, ["patient"], "user_pt");

  const slots = await frontDesk.query(
    api.domains.appointments.listAvailableSlots,
    {
      appointmentTypeId: world.appointmentTypeId,
      fromDate: "2026-08-03",
      toDate: "2026-08-03",
    },
  );
  expect(slots).toHaveLength(8); // 09:00–17:00, hourly
  expect(slots[0]!.providerName).toBe("Dr. Synthetic");
  expect(slots[0]!.timeZone).toBe(TZ);

  // An existing appointment removes exactly its slot.
  const taken = slots[2]!;
  await tx.run((ctx) =>
    ctx.db.insert("appointments", {
      patientId,
      appointmentTypeId: world.appointmentTypeId,
      providerId: world.providerId,
      locationId: world.locationId,
      startAt: taken.startAt,
      endAt: taken.endAt,
      timeZone: TZ,
      status: "scheduled",
      createdByUserId: world.providerUserId,
      createdAt: 0,
      updatedAt: 0,
    }),
  );
  const after = await frontDesk.query(
    api.domains.appointments.listAvailableSlots,
    {
      appointmentTypeId: world.appointmentTypeId,
      fromDate: "2026-08-03",
      toDate: "2026-08-03",
    },
  );
  expect(after.map((s) => s.startAt)).not.toContain(taken.startAt);
  expect(after).toHaveLength(7);

  await expect(
    frontDesk.query(api.domains.appointments.listAvailableSlots, {
      appointmentTypeId: world.appointmentTypeId,
      fromDate: "2026-08-03",
      toDate: "2026-12-03",
    }),
  ).rejects.toThrow("cannot exceed");
  await expect(
    patient.query(api.domains.appointments.listAvailableSlots, {
      appointmentTypeId: world.appointmentTypeId,
      fromDate: "2026-08-03",
      toDate: "2026-08-03",
    }),
  ).rejects.toThrow("Not authorized");
});

test("cancelled appointments free their slot; time off blocks it", async () => {
  const tx = convexTest(schema, modules);
  const world = await seedSchedulingWorld(tx);
  const [patientId] = await seedPatients(tx);
  const frontDesk = await seedUser(tx, ["frontDesk"], "user_fd");
  const startAt = zonedTimeToUtc("2026-08-04", 9 * 60, TZ)!;

  await tx.run(async (ctx) => {
    await ctx.db.insert("appointments", {
      patientId,
      appointmentTypeId: world.appointmentTypeId,
      providerId: world.providerId,
      locationId: world.locationId,
      startAt,
      endAt: startAt + 3_600_000,
      timeZone: TZ,
      status: "cancelled",
      createdByUserId: world.providerUserId,
      createdAt: 0,
      updatedAt: 0,
    });
    await ctx.db.insert("timeOff", {
      providerId: world.providerId,
      startAt: startAt + 3_600_000,
      endAt: startAt + 3 * 3_600_000,
      reason: "Team meeting",
      createdByUserId: world.providerUserId,
      createdAt: 0,
    });
  });

  const slots = await frontDesk.query(
    api.domains.appointments.listAvailableSlots,
    {
      appointmentTypeId: world.appointmentTypeId,
      fromDate: "2026-08-04",
      toDate: "2026-08-04",
    },
  );
  expect(slots.map((s) => s.localTime)).toEqual([
    "09:00",
    "12:00",
    "13:00",
    "14:00",
    "15:00",
    "16:00",
  ]);
});
