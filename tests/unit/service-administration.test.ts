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
  const [patientId] = await seedPatients(tx);
  const admin = await seedUser(tx, ["administrator"], "svc_admin");
  const frontDesk = await seedUser(tx, ["frontDesk"], "svc_front_desk");
  return { tx, world, patientId: patientId!, admin, frontDesk };
}

test("the catalog resolves the configuration graph for a service", async () => {
  const { tx, world, admin } = await setup();
  // A reminder schedule and a form rule linked to the appointment type.
  await admin.mutation(api.domains.communications.createTemplate, {
    name: "Reminder",
    intent: "appointmentReminder",
    channel: "sms",
    body: "Appointment with the practice on {{appointmentDate}}.",
  });
  const [template] = await admin.query(
    api.domains.communications.listTemplates,
    {},
  );
  await admin.mutation(api.domains.communications.publishTemplate, {
    versionId: template!.versions[0]!._id,
  });
  await admin.mutation(api.domains.communications.createSchedule, {
    appointmentTypeId: world.appointmentTypeId,
    templateId: template!._id,
    channel: "sms",
    intent: "appointmentReminder",
    minutesBefore: 1_440,
  });
  const formTemplateId = await admin.mutation(
    api.domains.forms.createTemplate,
    {
      name: "Follow-up intake",
      type: "intake",
    },
  );
  await admin.mutation(api.domains.assignments.createRule, {
    templateId: formTemplateId,
    audience: "all",
    appointmentType: "followUp",
  });
  await tx.run(async (ctx) => {
    await ctx.db.insert("resources", {
      locationId: world.locationId,
      name: "Room 1",
      type: "room",
      status: "active",
      createdAt: 0,
      updatedAt: 0,
    });
    const type = await ctx.db.get(world.appointmentTypeId);
    await ctx.db.patch(world.appointmentTypeId, {
      requiredResourceTypes: [...type!.requiredResourceTypes, "room"],
    });
  });

  const catalog = await admin.query(
    api.domains.administration.listServiceCatalog,
    {},
  );
  expect(catalog).toHaveLength(1);
  expect(catalog[0]?.appointmentTypeCount).toBe(1);

  const config = await admin.query(
    api.domains.administration.getServiceConfiguration,
    { serviceId: world.serviceId },
  );
  const [type] = config.appointmentTypes;
  expect(type?.reminders.map((r) => r.templateName)).toEqual(["Reminder"]);
  expect(type?.forms.map((f) => f.templateName)).toEqual(["Follow-up intake"]);
  expect(type?.resourceRequirements).toEqual([
    { type: "room", availableCount: 1 },
  ]);
  expect(type?.providerNames).toEqual(["Dr. Synthetic"]);
});

test("future and expired services are configurable but never bookable", async () => {
  const { world, patientId, admin, frontDesk } = await setup();
  await admin.mutation(api.domains.administration.setServiceStatus, {
    serviceId: world.serviceId,
    status: "future",
    reason: "Launching next quarter",
  });
  await expect(
    frontDesk.mutation(api.domains.appointments.book, {
      patientId,
      appointmentTypeId: world.appointmentTypeId,
      providerId: world.providerId,
      startAt: MONDAY_9AM,
    }),
  ).rejects.toThrow("Service is not yet in service");

  await admin.mutation(api.domains.administration.setServiceStatus, {
    serviceId: world.serviceId,
    status: "active",
    reason: "Launch date reached",
  });
  await admin.mutation(api.domains.administration.updateService, {
    serviceId: world.serviceId,
    name: "General Care",
    effectiveTo: MONDAY_9AM - 1,
  });
  await expect(
    frontDesk.mutation(api.domains.appointments.book, {
      patientId,
      appointmentTypeId: world.appointmentTypeId,
      providerId: world.providerId,
      startAt: MONDAY_9AM,
    }),
  ).rejects.toThrow("Service is no longer effective");

  // An effective window must be coherent.
  await expect(
    admin.mutation(api.domains.administration.updateService, {
      serviceId: world.serviceId,
      name: "General Care",
      effectiveFrom: 2_000,
      effectiveTo: 1_000,
    }),
  ).rejects.toThrow("effective end must come after");
});

test("disabling configuration with future appointments requires a migration", async () => {
  const { tx, world, patientId, admin, frontDesk } = await setup();
  // An appointment far enough ahead that it counts as future work.
  const future = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const appointmentId = await tx.run(async (ctx) => {
    return await ctx.db.insert("appointments", {
      patientId,
      appointmentTypeId: world.appointmentTypeId,
      providerId: world.providerId,
      locationId: world.locationId,
      startAt: future,
      endAt: future + 60 * 60 * 1000,
      timeZone: TZ,
      status: "confirmed" as const,
      createdByUserId: world.providerUserId,
      createdAt: 0,
      updatedAt: 0,
    });
  });

  await expect(
    admin.mutation(api.domains.administration.setServiceStatus, {
      serviceId: world.serviceId,
      status: "disabled",
      reason: "Service retired",
    }),
  ).rejects.toThrow("1 future appointment(s) use this configuration");

  // Keeping them disables new bookings without touching existing work.
  const kept = await admin.mutation(
    api.domains.administration.setServiceStatus,
    {
      serviceId: world.serviceId,
      status: "disabled",
      reason: "Service retired",
      migration: "keepExisting",
    },
  );
  expect(kept.cancelledAppointments).toBe(0);
  expect(
    await tx.run(async (ctx) => (await ctx.db.get(appointmentId))!.status),
  ).toBe("confirmed");
  await expect(
    frontDesk.mutation(api.domains.appointments.book, {
      patientId,
      appointmentTypeId: world.appointmentTypeId,
      providerId: world.providerId,
      startAt: MONDAY_9AM,
    }),
  ).rejects.toThrow("Service is disabled");
});

test("cancelling migration closes affected appointments through the lifecycle", async () => {
  const { tx, world, patientId, admin } = await setup();
  const future = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const appointmentId = await tx.run(async (ctx) =>
    ctx.db.insert("appointments", {
      patientId,
      appointmentTypeId: world.appointmentTypeId,
      providerId: world.providerId,
      locationId: world.locationId,
      startAt: future,
      endAt: future + 60 * 60 * 1000,
      timeZone: TZ,
      status: "scheduled" as const,
      createdByUserId: world.providerUserId,
      createdAt: 0,
      updatedAt: 0,
    }),
  );

  const result = await admin.mutation(
    api.domains.scheduling.setAppointmentTypeStatus,
    {
      appointmentTypeId: world.appointmentTypeId,
      status: "archived",
      reason: "Type replaced",
      migration: "cancelAffected",
    },
  );
  expect(result).toBeNull();

  const appointment = await tx.run(
    async (ctx) => await ctx.db.get(appointmentId),
  );
  expect(appointment?.status).toBe("cancelled");
  expect(appointment?.cancellationReason).toBe("Type replaced");
  // History records the transition like any manual cancellation.
  const events = await tx.run(
    async (ctx) => await ctx.db.query("appointmentEvents").collect(),
  );
  expect(events.map((e) => e.toStatus)).toContain("cancelled");
});

test("catalog administration is restricted to config.manage", async () => {
  const { world, frontDesk } = await setup();
  await expect(
    frontDesk.query(api.domains.administration.listServiceCatalog, {}),
  ).rejects.toThrow("Not authorized");
  await expect(
    frontDesk.query(api.domains.administration.getServiceConfiguration, {
      serviceId: world.serviceId,
    }),
  ).rejects.toThrow("Not authorized");
  await expect(
    frontDesk.mutation(api.domains.administration.setServiceStatus, {
      serviceId: world.serviceId,
      status: "disabled",
      reason: "Nope",
    }),
  ).rejects.toThrow("Not authorized");
});
