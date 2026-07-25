// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { zonedTimeToUtc } from "../../convex/lib/time";
import schema from "../../convex/schema";
import { INTAKE_DEFINITION, seedUser } from "../fixtures/forms";
import { seedPatients } from "../fixtures/patients";
import { seedSchedulingWorld, TZ } from "../fixtures/scheduling";

const modules = import.meta.glob("../../convex/**/*.ts");

const MONDAY_9AM = zonedTimeToUtc("2026-08-03", 9 * 60, TZ)!;

async function setup() {
  const tx = convexTest(schema, modules);
  const world = await seedSchedulingWorld(tx);
  const [patientId] = await seedPatients(tx);
  const frontDesk = await seedUser(tx, ["frontDesk"], "user_fd");
  return { tx, world, patientId: patientId!, frontDesk };
}

test("booking creates the appointment, its event history, and assigned forms", async () => {
  const { tx, world, patientId, frontDesk } = await setup();
  const admin = await seedUser(tx, ["administrator"], "user_admin");
  const templateId = await admin.mutation(api.domains.forms.createTemplate, {
    name: "New patient intake",
    type: "intake",
  });
  const versionId = await admin.mutation(api.domains.forms.createDraftVersion, {
    templateId,
    definition: INTAKE_DEFINITION,
  });
  await admin.mutation(api.domains.forms.publishVersion, { versionId });
  await admin.mutation(api.domains.assignments.createRule, {
    templateId,
    audience: "new",
  });

  const result = await frontDesk.mutation(api.domains.appointments.book, {
    patientId,
    appointmentTypeId: world.appointmentTypeId,
    providerId: world.providerId,
    startAt: MONDAY_9AM,
  });
  expect(result.ok).toBe(true);
  expect(result.ok && result.formsAssigned).toBe(1);

  const stored = await tx.run((ctx) => ctx.db.query("appointments").collect());
  expect(stored).toHaveLength(1);
  expect(stored[0]!.status).toBe("scheduled");
  expect(stored[0]!.endAt - stored[0]!.startAt).toBe(3_600_000);
  expect(stored[0]!.timeZone).toBe(TZ);

  const events = await tx.run((ctx) =>
    ctx.db.query("appointmentEvents").collect(),
  );
  expect(events).toHaveLength(1);
  expect(events[0]!.toStatus).toBe("scheduled");

  const audits = await tx.run((ctx) => ctx.db.query("auditEvents").collect());
  expect(audits.some((a) => a.action === "appointment.booked")).toBe(true);

  const assignments = await frontDesk.query(
    api.domains.assignments.listForPatient,
    { patientId },
  );
  expect(assignments.map((a) => a.templateName)).toEqual([
    "New patient intake",
  ]);
});

test("two attempts on the same slot cannot both succeed", async () => {
  const { world, patientId, frontDesk, tx } = await setup();
  const [, secondPatientId] = await tx.run((ctx) =>
    ctx.db.query("patients").collect(),
  );

  const [first, second] = await Promise.all([
    frontDesk.mutation(api.domains.appointments.book, {
      patientId,
      appointmentTypeId: world.appointmentTypeId,
      providerId: world.providerId,
      startAt: MONDAY_9AM,
    }),
    frontDesk.mutation(api.domains.appointments.book, {
      patientId: secondPatientId!._id,
      appointmentTypeId: world.appointmentTypeId,
      providerId: world.providerId,
      startAt: MONDAY_9AM,
    }),
  ]);

  expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
  const loser = first.ok ? second : first;
  expect(loser.ok === false && loser.reason).toBe("slotUnavailable");
  const stored = await tx.run((ctx) => ctx.db.query("appointments").collect());
  expect(stored).toHaveLength(1);
});

test("times outside generated slots are rejected", async () => {
  const { world, patientId, frontDesk } = await setup();
  // 09:07 is not an offered start; 07:00 is outside working hours.
  for (const startAt of [MONDAY_9AM + 7 * 60_000, MONDAY_9AM - 2 * 3_600_000]) {
    const result = await frontDesk.mutation(api.domains.appointments.book, {
      patientId,
      appointmentTypeId: world.appointmentTypeId,
      providerId: world.providerId,
      startAt,
    });
    expect(result.ok).toBe(false);
  }
});

test("booking blocked for time off, ineligible providers, and unauthorized users", async () => {
  const { tx, world, patientId, frontDesk } = await setup();
  const admin = await seedUser(tx, ["administrator"], "user_admin");
  await admin.mutation(api.domains.scheduling.createTimeOff, {
    providerId: world.providerId,
    startAt: MONDAY_9AM,
    endAt: MONDAY_9AM + 3_600_000,
    reason: "Case conference",
  });
  const blocked = await frontDesk.mutation(api.domains.appointments.book, {
    patientId,
    appointmentTypeId: world.appointmentTypeId,
    providerId: world.providerId,
    startAt: MONDAY_9AM,
  });
  expect(blocked.ok).toBe(false);

  const otherProviderId = await tx.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkUserId: "user_provider_2",
      type: "workforce" as const,
      status: "active" as const,
      roles: ["provider" as const],
      displayName: "Dr. Second",
      createdAt: 0,
      updatedAt: 0,
    });
    return await ctx.db.insert("providers", {
      userId,
      displayName: "Dr. Second",
      status: "active" as const,
      createdAt: 0,
      updatedAt: 0,
    });
  });
  await expect(
    frontDesk.mutation(api.domains.appointments.book, {
      patientId,
      appointmentTypeId: world.appointmentTypeId,
      providerId: otherProviderId,
      startAt: MONDAY_9AM + 3_600_000,
    }),
  ).rejects.toThrow("not eligible");

  for (const role of ["patient", "auditor"] as const) {
    const user = await seedUser(tx, [role], `user_${role}`);
    await expect(
      user.mutation(api.domains.appointments.book, {
        patientId,
        appointmentTypeId: world.appointmentTypeId,
        providerId: world.providerId,
        startAt: MONDAY_9AM + 3_600_000,
      }),
    ).rejects.toThrow("Not authorized");
  }
});
