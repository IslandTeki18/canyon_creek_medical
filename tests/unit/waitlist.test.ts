// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { zonedTimeToUtc } from "../../convex/lib/time";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedPatients } from "../fixtures/patients";
import { seedSchedulingWorld, TZ } from "../fixtures/scheduling";

const modules = import.meta.glob("../../convex/**/*.ts");

const MONDAY_9AM = zonedTimeToUtc("2026-08-03", 9 * 60, TZ)!;

async function setup() {
  const tx = convexTest(schema, modules);
  const world = await seedSchedulingWorld(tx);
  const [patientId, otherPatientId] = await seedPatients(tx);
  const frontDesk = await seedUser(tx, ["frontDesk"], "user_fd");
  const entryId = await frontDesk.mutation(api.domains.waitlist.addEntry, {
    patientId: patientId!,
    appointmentTypeId: world.appointmentTypeId,
    fromDate: "2026-08-03",
    toDate: "2026-08-07",
  });
  return {
    tx,
    world,
    patientId: patientId!,
    otherPatientId: otherPatientId!,
    frontDesk,
    entryId,
  };
}

test("entries validate their window and appear with patient context", async () => {
  const { world, patientId, frontDesk } = await setup();

  await expect(
    frontDesk.mutation(api.domains.waitlist.addEntry, {
      patientId,
      appointmentTypeId: world.appointmentTypeId,
      fromDate: "2026-08-10",
      toDate: "2026-08-03",
    }),
  ).rejects.toThrow("ends before it starts");

  const open = await frontDesk.query(api.domains.waitlist.list, {
    status: "open",
  });
  expect(open).toHaveLength(1);
  expect(open[0]!.patientName).toBe("Testerson, Ave");
  expect(open[0]!.preferredProviderName).toBeUndefined();
});

test("contact attempts and removal require a reason and are audited", async () => {
  const { tx, frontDesk, entryId } = await setup();

  await expect(
    frontDesk.mutation(api.domains.waitlist.setStatus, {
      entryId,
      status: "contacted",
      reason: " ",
    }),
  ).rejects.toThrow("A reason is required");

  await frontDesk.mutation(api.domains.waitlist.setStatus, {
    entryId,
    status: "contacted",
    reason: "Left voicemail",
  });
  const audits = await tx.run((ctx) => ctx.db.query("auditEvents").collect());
  expect(audits.some((a) => a.action === "waitlist.contacted")).toBe(true);
  expect(audits.find((a) => a.action === "waitlist.contacted")?.reason).toBe(
    "Left voicemail",
  );
});

test("conversion books through the normal slot checks", async () => {
  const { tx, world, frontDesk, entryId } = await setup();

  const result = await frontDesk.mutation(api.domains.waitlist.convert, {
    entryId,
    providerId: world.providerId,
    startAt: MONDAY_9AM,
  });
  expect(result.ok).toBe(true);

  const [entry] = await frontDesk.query(api.domains.waitlist.list, {
    status: "converted",
  });
  expect(entry!.convertedAppointmentId).toBeDefined();

  const appointments = await tx.run((ctx) =>
    ctx.db.query("appointments").collect(),
  );
  expect(appointments).toHaveLength(1);
  expect(appointments[0]!.status).toBe("scheduled");

  // A converted entry is closed to further changes.
  await expect(
    frontDesk.mutation(api.domains.waitlist.setStatus, {
      entryId,
      status: "cancelled",
      reason: "Too late",
    }),
  ).rejects.toThrow("Converted entries cannot be changed");
});

test("conversion cannot bypass slot conflicts", async () => {
  const { world, otherPatientId, frontDesk, entryId } = await setup();

  // Someone else takes the 09:00 slot first.
  const booked = await frontDesk.mutation(api.domains.appointments.book, {
    patientId: otherPatientId,
    appointmentTypeId: world.appointmentTypeId,
    providerId: world.providerId,
    startAt: MONDAY_9AM,
  });
  expect(booked.ok).toBe(true);

  const result = await frontDesk.mutation(api.domains.waitlist.convert, {
    entryId,
    providerId: world.providerId,
    startAt: MONDAY_9AM,
  });
  expect(result.ok).toBe(false);
  const [entry] = await frontDesk.query(api.domains.waitlist.list, {
    status: "open",
  });
  expect(entry!._id).toBe(entryId); // still waiting
});

test("patients and auditors cannot read or write the waitlist", async () => {
  const { tx, world, patientId, entryId } = await setup();
  for (const role of ["patient", "auditor"] as const) {
    const user = await seedUser(tx, [role], `user_${role}`);
    await expect(user.query(api.domains.waitlist.list, {})).rejects.toThrow(
      "Not authorized",
    );
    await expect(
      user.mutation(api.domains.waitlist.addEntry, {
        patientId,
        appointmentTypeId: world.appointmentTypeId,
        fromDate: "2026-08-03",
        toDate: "2026-08-07",
      }),
    ).rejects.toThrow("Not authorized");
    await expect(
      user.mutation(api.domains.waitlist.convert, {
        entryId,
        providerId: world.providerId,
        startAt: MONDAY_9AM,
      }),
    ).rejects.toThrow("Not authorized");
  }
});
