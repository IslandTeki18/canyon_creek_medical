// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedKetamineWorld } from "../fixtures/ketamine";

const modules = import.meta.glob("../../convex/**/*.ts");

test("course supports multiple independently documented sessions", async () => {
  const tx = convexTest(schema, modules);
  const world = await seedKetamineWorld(tx);
  const { provider, courseId } = world;
  // Activation is blocked without clearance (10.2 records it).
  await expect(
    provider.mutation(api.domains.ketamine.setCourseState, {
      courseId,
      state: "active",
      reason: "Trying to skip clearance",
    }),
  ).rejects.toThrow("clearance approval is required");
  await tx.run(async (ctx) => {
    await ctx.db.patch(courseId, { state: "active" });
  });
  const first = await provider.mutation(api.domains.ketamine.createSession, {
    courseId,
  });
  const second = await provider.mutation(api.domains.ketamine.createSession, {
    courseId,
  });
  expect(first).not.toBe(second);
  const sessions = await provider.query(
    api.domains.ketamine.listSessionsForCourse,
    { courseId },
  );
  expect(sessions).toHaveLength(2);
  expect(sessions.every((s) => s.state === "planned")).toBe(true);

  // Cancellation preserves the row and requires a reason.
  await expect(
    provider.mutation(api.domains.ketamine.cancelSession, {
      sessionId: first,
      reason: " ",
    }),
  ).rejects.toThrow("reason is required");
  await provider.mutation(api.domains.ketamine.cancelSession, {
    sessionId: first,
    reason: "Patient rescheduled",
  });
  const detail = await provider.query(api.domains.ketamine.getCourse, {
    courseId,
  });
  expect(detail?.sessions.map((s) => s.state).sort()).toEqual([
    "cancelled",
    "planned",
  ]);
});

test("one open course per patient; invalid transitions fail", async () => {
  const tx = convexTest(schema, modules);
  const world = await seedKetamineWorld(tx);
  await expect(
    world.provider.mutation(api.domains.ketamine.createCourse, {
      patientId: world.patientId,
      approvingProviderId: world.providerId,
    }),
  ).rejects.toThrow("already has an open ketamine course");
  await expect(
    world.provider.mutation(api.domains.ketamine.setCourseState, {
      courseId: world.courseId,
      state: "completed",
      reason: "Skipping activation",
    }),
  ).rejects.toThrow("Cannot move course from screening to completed");
});

test("ketamine records require clinical.manage", async () => {
  const tx = convexTest(schema, modules);
  const world = await seedKetamineWorld(tx);
  const frontDesk = await seedUser(tx, ["frontDesk"], "ket_fd");
  await expect(
    frontDesk.query(api.domains.ketamine.listCoursesForPatient, {
      patientId: world.patientId,
    }),
  ).rejects.toThrow("Not authorized");
  await expect(
    frontDesk.mutation(api.domains.ketamine.createCourse, {
      patientId: world.patientId,
      approvingProviderId: world.providerId,
    }),
  ).rejects.toThrow("Not authorized");
  await expect(
    frontDesk.mutation(api.domains.ketamine.createSession, {
      courseId: world.courseId,
    }),
  ).rejects.toThrow("Not authorized");
});
