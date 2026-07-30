// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedKetamineWorld, type KetamineWorld } from "../fixtures/ketamine";
import { seedPatients } from "../fixtures/patients";

const modules = import.meta.glob("../../convex/**/*.ts");

/** Ketamine appointment type needing one room, one room, two providers. */
async function seedConstrainedWorld(tx: ReturnType<typeof convexTest>) {
  const world: KetamineWorld = await seedKetamineWorld(tx);
  const ids = await tx.run(async (ctx) => {
    const now = 0;
    const roomId = await ctx.db.insert("resources", {
      locationId: world.locationId,
      name: "Infusion Room 1",
      type: "room",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const secondUserId = await ctx.db.insert("users", {
      clerkUserId: "user_fixture_provider_2",
      type: "workforce",
      status: "active",
      roles: ["provider"],
      displayName: "Dr. Second",
      createdAt: now,
      updatedAt: now,
    });
    const secondProviderId = await ctx.db.insert("providers", {
      userId: secondUserId,
      displayName: "Dr. Second",
      defaultLocationId: world.locationId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    for (const weekday of [1, 2, 3, 4, 5]) {
      await ctx.db.insert("availabilityRules", {
        providerId: secondProviderId,
        locationId: world.locationId,
        weekday,
        startMinute: 9 * 60,
        endMinute: 17 * 60,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    const ketamineTypeId = await ctx.db.insert("appointmentTypes", {
      serviceId: world.serviceId,
      key: "ketamineSession",
      name: "Ketamine Session",
      durationMinutes: 60,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      locationId: world.locationId,
      eligibleProviderIds: [world.providerId, secondProviderId],
      requiredResourceTypes: ["room"],
      patientSelfSchedulable: false,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    return { roomId, secondProviderId, ketamineTypeId };
  });
  return { world, ...ids };
}

test("bookings cannot reserve the same constrained room", async () => {
  const tx = convexTest(schema, modules);
  const { world, roomId, secondProviderId, ketamineTypeId } =
    await seedConstrainedWorld(tx);
  const [, secondPatientId] = await seedPatients(tx);
  const frontDesk = await seedUser(tx, ["frontDesk"], "ket_book_fd");

  const slots = await frontDesk.query(
    api.domains.appointments.listAvailableSlots,
    {
      appointmentTypeId: ketamineTypeId,
      providerId: world.providerId,
      fromDate: "2026-08-03",
      toDate: "2026-08-03",
    },
  );
  expect(slots.length).toBeGreaterThan(0);
  const startAt = slots[0]!.startAt;

  const first = await frontDesk.mutation(api.domains.appointments.book, {
    patientId: world.patientId,
    appointmentTypeId: ketamineTypeId,
    providerId: world.providerId,
    startAt,
  });
  expect(first.ok).toBe(true);
  // The booked appointment holds the room.
  const appointment = await tx.run((ctx) =>
    ctx.db.get((first as { appointmentId: Id<"appointments"> }).appointmentId),
  );
  expect(appointment?.resourceIds).toEqual([roomId]);

  // A different provider at the same time loses the single room.
  const second = await frontDesk.mutation(api.domains.appointments.book, {
    patientId: secondPatientId!,
    appointmentTypeId: ketamineTypeId,
    providerId: secondProviderId,
    startAt,
  });
  expect(second).toEqual({ ok: false, reason: "resourceUnavailable" });

  // The occupied time no longer appears as an offered slot for anyone.
  const after = await frontDesk.query(
    api.domains.appointments.listAvailableSlots,
    {
      appointmentTypeId: ketamineTypeId,
      providerId: secondProviderId,
      fromDate: "2026-08-03",
      toDate: "2026-08-03",
    },
  );
  expect(after.some((s) => s.startAt === startAt)).toBe(false);
});

test("types without resource requirements book unchanged", async () => {
  const tx = convexTest(schema, modules);
  const { world } = await seedConstrainedWorld(tx);
  const frontDesk = await seedUser(tx, ["frontDesk"], "ket_book_fd2");
  const slots = await frontDesk.query(
    api.domains.appointments.listAvailableSlots,
    {
      appointmentTypeId: world.appointmentTypeId,
      fromDate: "2026-08-03",
      toDate: "2026-08-03",
    },
  );
  const result = await frontDesk.mutation(api.domains.appointments.book, {
    patientId: world.patientId,
    appointmentTypeId: world.appointmentTypeId,
    providerId: world.providerId,
    startAt: slots[0]!.startAt,
  });
  expect(result.ok).toBe(true);
});
