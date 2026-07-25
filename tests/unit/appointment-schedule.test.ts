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

async function setup() {
  const tx = convexTest(schema, modules);
  const world = await seedSchedulingWorld(tx);
  const [patientId] = await seedPatients(tx);
  const frontDesk = await seedUser(tx, ["frontDesk"], "user_fd");
  const booked = await frontDesk.mutation(api.domains.appointments.book, {
    patientId: patientId!,
    appointmentTypeId: world.appointmentTypeId,
    providerId: world.providerId,
    startAt: zonedTimeToUtc("2026-08-03", 9 * 60, TZ)!,
  });
  if (!booked.ok) throw new Error("fixture booking failed");
  return { tx, world, patientId: patientId!, frontDesk, booked };
}

test("day and week views filter by date, provider, and location", async () => {
  const { world, frontDesk } = await setup();

  const day = await frontDesk.query(api.domains.appointments.listSchedule, {
    fromDate: "2026-08-03",
    toDate: "2026-08-03",
  });
  expect(day).toHaveLength(1);
  expect(day[0]!.localTime).toBe("09:00");
  expect(day[0]!.patientName).toBe("Testerson, Ave");
  expect(day[0]!.ready).toBe(false); // synthetic patient has no profile data
  expect(day[0]!.missingCount).toBeGreaterThan(0);

  // The day before is empty; the week containing it is not.
  expect(
    await frontDesk.query(api.domains.appointments.listSchedule, {
      fromDate: "2026-08-02",
      toDate: "2026-08-02",
    }),
  ).toHaveLength(0);
  expect(
    await frontDesk.query(api.domains.appointments.listSchedule, {
      fromDate: "2026-08-02",
      toDate: "2026-08-08",
    }),
  ).toHaveLength(1);

  expect(
    await frontDesk.query(api.domains.appointments.listSchedule, {
      fromDate: "2026-08-03",
      toDate: "2026-08-03",
      providerId: world.providerId,
      locationId: world.locationId,
    }),
  ).toHaveLength(1);
});

test("schedule rows carry operational fields only", async () => {
  const { frontDesk } = await setup();
  const [row] = await frontDesk.query(api.domains.appointments.listSchedule, {
    fromDate: "2026-08-03",
    toDate: "2026-08-03",
  });
  // No clinical content reaches a calendar cell: only identity, timing,
  // operational status, and a readiness summary.
  expect(Object.keys(row!).sort()).toEqual(
    [
      // cancellationReason is absent until the appointment is cancelled.
      "_id",
      "appointmentTypeName",
      "date",
      "endAt",
      "localTime",
      "locationId",
      "locationName",
      "missingCount",
      "patientId",
      "patientName",
      "providerId",
      "providerName",
      "ready",
      "startAt",
      "status",
      "timeZone",
    ].sort(),
  );
});

test("detail exposes the event history and permitted transitions", async () => {
  const { frontDesk, booked } = await setup();
  const detail = await frontDesk.query(
    api.domains.appointments.getAppointment,
    {
      appointmentId: booked.appointmentId!,
    },
  );
  expect(detail?.events).toHaveLength(1);
  expect(detail?.events[0]!.toStatus).toBe("scheduled");
  expect(detail?.events[0]!.actorName).toBe("Synthetic user_fd");
  expect(detail?.allowedTransitions).toContain("checkedIn");
  expect(detail?.allowedTransitions).not.toContain("completed");
});

test("patient chart lists appointments; unauthorized roles cannot read them", async () => {
  const { tx, frontDesk, patientId } = await setup();
  const chart = await frontDesk.query(api.domains.appointments.listForPatient, {
    patientId,
  });
  expect(chart).toHaveLength(1);

  const auditor = await seedUser(tx, ["auditor"], "user_auditor");
  await expect(
    auditor.query(api.domains.appointments.listSchedule, {
      fromDate: "2026-08-03",
      toDate: "2026-08-03",
    }),
  ).rejects.toThrow("Not authorized");
  await expect(
    auditor.query(api.domains.appointments.listForPatient, { patientId }),
  ).rejects.toThrow("Not authorized");
});
