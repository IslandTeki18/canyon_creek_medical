// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createSelfLink } from "../../convex/lib/access";
import { zonedTimeToUtc } from "../../convex/lib/time";
import schema from "../../convex/schema";
import { INTAKE_DEFINITION, seedUser } from "../fixtures/forms";
import { seedPatients } from "../fixtures/patients";
import { seedSchedulingWorld, TZ } from "../fixtures/scheduling";

const modules = import.meta.glob("../../convex/**/*.ts");

const MONDAY_9AM = zonedTimeToUtc("2026-08-03", 9 * 60, TZ)!;
const MONDAY_11AM = zonedTimeToUtc("2026-08-03", 11 * 60, TZ)!;

async function setup() {
  const tx = convexTest(schema, modules);
  const world = await seedSchedulingWorld(tx);
  const [patientId] = await seedPatients(tx);
  const frontDesk = await seedUser(tx, ["frontDesk"], "user_fd");
  const booked = await frontDesk.mutation(api.domains.appointments.book, {
    patientId: patientId!,
    appointmentTypeId: world.appointmentTypeId,
    providerId: world.providerId,
    startAt: MONDAY_9AM,
  });
  if (!booked.ok) throw new Error("fixture booking failed");
  return {
    tx,
    world,
    patientId: patientId!,
    frontDesk,
    appointmentId: booked.appointmentId,
  };
}

test("valid transitions record events; invalid ones fail", async () => {
  const { tx, frontDesk, appointmentId } = await setup();

  for (const toStatus of [
    "confirmed",
    "checkedIn",
    "inProgress",
    "completed",
  ] as const) {
    await frontDesk.mutation(api.domains.appointments.transition, {
      appointmentId,
      toStatus,
    });
  }
  const detail = await frontDesk.query(
    api.domains.appointments.getAppointment,
    { appointmentId },
  );
  expect(detail?.status).toBe("completed");
  expect(detail?.events.map((e) => e.toStatus)).toEqual([
    "scheduled",
    "confirmed",
    "checkedIn",
    "inProgress",
    "completed",
  ]);
  expect(detail?.allowedTransitions).toHaveLength(0);

  await expect(
    frontDesk.mutation(api.domains.appointments.transition, {
      appointmentId,
      toStatus: "scheduled",
    }),
  ).rejects.toThrow("Cannot move an appointment from completed to scheduled");

  const audits = await tx.run((ctx) => ctx.db.query("auditEvents").collect());
  expect(audits.some((a) => a.action === "appointment.completed")).toBe(true);
});

test("cancellation and no-show require a reason and free the slot", async () => {
  const { frontDesk, world, appointmentId } = await setup();

  await expect(
    frontDesk.mutation(api.domains.appointments.transition, {
      appointmentId,
      toStatus: "cancelled",
      reason: "  ",
    }),
  ).rejects.toThrow("A reason is required");

  await frontDesk.mutation(api.domains.appointments.transition, {
    appointmentId,
    toStatus: "cancelled",
    reason: "Patient called",
    cancellationCategory: "patient",
  });

  const slots = await frontDesk.query(
    api.domains.appointments.listAvailableSlots,
    {
      appointmentTypeId: world.appointmentTypeId,
      fromDate: "2026-08-03",
      toDate: "2026-08-03",
    },
  );
  expect(slots.map((s) => s.startAt)).toContain(MONDAY_9AM);
});

test("rescheduling preserves history and does not duplicate form requirements", async () => {
  const { tx, frontDesk, patientId, appointmentId } = await setup();
  const admin = await seedUser(tx, ["administrator"], "user_admin");
  const templateId = await admin.mutation(api.domains.forms.createTemplate, {
    name: "Intake",
    type: "intake",
  });
  const versionId = await admin.mutation(api.domains.forms.createDraftVersion, {
    templateId,
    definition: INTAKE_DEFINITION,
  });
  await admin.mutation(api.domains.forms.publishVersion, { versionId });
  await admin.mutation(api.domains.assignments.createRule, {
    templateId,
    audience: "all",
  });
  await frontDesk.mutation(api.domains.assignments.runForPatient, {
    patientId,
  });

  const moved = await frontDesk.mutation(api.domains.appointments.reschedule, {
    appointmentId,
    startAt: MONDAY_11AM,
    reason: "Patient requested a later time",
  });
  expect(moved.formsAssigned).toBe(0); // idempotent: already assigned

  const original = await frontDesk.query(
    api.domains.appointments.getAppointment,
    { appointmentId },
  );
  expect(original?.status).toBe("cancelled");
  expect(original?.events).toHaveLength(2);

  const replacement = await frontDesk.query(
    api.domains.appointments.getAppointment,
    { appointmentId: moved.appointmentId },
  );
  expect(replacement?.status).toBe("scheduled");
  expect(replacement?.localTime).toBe("11:00");

  const assignments = await frontDesk.query(
    api.domains.assignments.listForPatient,
    { patientId },
  );
  expect(assignments).toHaveLength(1);

  // The freed 09:00 slot is bookable again, and the new 11:00 one is not.
  const slots = await frontDesk.query(
    api.domains.appointments.listAvailableSlots,
    {
      appointmentTypeId: (await tx.run((ctx) =>
        ctx.db.query("appointmentTypes").first(),
      ))!._id,
      fromDate: "2026-08-03",
      toDate: "2026-08-03",
    },
  );
  expect(slots.map((s) => s.startAt)).toContain(MONDAY_9AM);
  expect(slots.map((s) => s.startAt)).not.toContain(MONDAY_11AM);
});

test("rescheduling to an unavailable time changes nothing", async () => {
  const { frontDesk, appointmentId } = await setup();
  await expect(
    frontDesk.mutation(api.domains.appointments.reschedule, {
      appointmentId,
      startAt: MONDAY_9AM - 3 * 3_600_000, // 06:00, outside working hours
      reason: "Earlier",
    }),
  ).rejects.toThrow("no longer available");

  const detail = await frontDesk.query(
    api.domains.appointments.getAppointment,
    { appointmentId },
  );
  expect(detail?.status).toBe("scheduled");
  expect(detail?.events).toHaveLength(1);
});

test("patients see their own appointments and may cancel only when configured", async () => {
  const { tx, world, patientId, appointmentId, frontDesk } = await setup();
  const userId = await tx.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "user_self",
      type: "patient" as const,
      status: "active" as const,
      roles: ["patient" as const],
      displayName: "Synthetic Self",
      createdAt: 0,
      updatedAt: 0,
    }),
  );
  await tx.run((ctx) =>
    createSelfLink(ctx, {
      patientId,
      userId,
      verificationMethod: "invitation",
    }),
  );
  const me = tx.withIdentity({ subject: "user_self" });

  const mine = await me.query(api.domains.appointments.listMyAppointments, {});
  expect(mine).toHaveLength(1);
  expect(mine[0]!.cancellable).toBe(false);
  // Neutral operational fields only — no provider-facing readiness detail.
  expect(Object.keys(mine[0]!)).not.toContain("patientName");

  await expect(
    me.mutation(api.domains.appointments.cancelMyAppointment, {
      appointmentId,
      reason: "Conflict",
    }),
  ).rejects.toThrow("call the practice");

  // Staff enable self-service for this appointment type.
  const admin = await seedUser(tx, ["administrator"], "user_admin");
  await admin.mutation(api.domains.scheduling.updateAppointmentType, {
    appointmentTypeId: world.appointmentTypeId,
    name: "Follow-up",
    durationMinutes: 60,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    eligibleProviderIds: [world.providerId],
    patientSelfSchedulable: true,
  });

  await me.mutation(api.domains.appointments.cancelMyAppointment, {
    appointmentId,
    reason: "Conflict",
  });
  const after = await frontDesk.query(api.domains.appointments.getAppointment, {
    appointmentId,
  });
  expect(after?.status).toBe("cancelled");
  expect(after?.events.at(-1)!.actorName).toBe("Synthetic Self");
});

test("patients cannot transition appointments or reach another patient's", async () => {
  const { tx, appointmentId, patientId } = await setup();
  const [, otherPatientId] = await tx.run((ctx) =>
    ctx.db.query("patients").collect(),
  );
  const userId = await tx.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "user_other",
      type: "patient" as const,
      status: "active" as const,
      roles: ["patient" as const],
      displayName: "Other Patient",
      createdAt: 0,
      updatedAt: 0,
    }),
  );
  await tx.run((ctx) =>
    createSelfLink(ctx, {
      patientId: otherPatientId!._id,
      userId,
      verificationMethod: "invitation",
    }),
  );
  const other = tx.withIdentity({ subject: "user_other" });
  expect(patientId).not.toBe(otherPatientId!._id);

  await expect(
    other.mutation(api.domains.appointments.transition, {
      appointmentId,
      toStatus: "cancelled",
      reason: "nope",
    }),
  ).rejects.toThrow("Not authorized");
  await expect(
    other.mutation(api.domains.appointments.cancelMyAppointment, {
      appointmentId,
      reason: "nope",
    }),
  ).rejects.toThrow("Not authorized");
  expect(
    await other.query(api.domains.appointments.listMyAppointments, {}),
  ).toHaveLength(0);
});
