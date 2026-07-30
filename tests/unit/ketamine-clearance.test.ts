// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { activateCourse, seedKetamineWorld } from "../fixtures/ketamine";

const modules = import.meta.glob("../../convex/**/*.ts");

test("clearance decisions are clinician-only, reasoned, and append-only", async () => {
  const tx = convexTest(schema, modules);
  const world = await seedKetamineWorld(tx);
  // clinicalStaff holds clinical.manage but not encounter.sign.
  await expect(
    world.clinicalStaff.mutation(api.domains.ketamine.recordClearance, {
      courseId: world.courseId,
      decision: "approved",
      rationale: "Not a clinician",
    }),
  ).rejects.toThrow("Not authorized");
  await expect(
    world.provider.mutation(api.domains.ketamine.recordClearance, {
      courseId: world.courseId,
      decision: "approved",
      rationale: " ",
    }),
  ).rejects.toThrow("reason is required");
  await world.provider.mutation(api.domains.ketamine.recordClearance, {
    courseId: world.courseId,
    decision: "deferred",
    rationale: "Awaiting baseline data",
  });
  await world.provider.mutation(api.domains.ketamine.recordClearance, {
    courseId: world.courseId,
    decision: "approved",
    rationale: "Baseline reviewed",
  });
  const detail = await world.provider.query(api.domains.ketamine.getCourse, {
    courseId: world.courseId,
  });
  // Both decisions retained; nothing replaced.
  expect(detail?.reviews.map((r) => r.decision)).toEqual([
    "deferred",
    "approved",
  ]);
});

test("readiness explains missing prerequisites; system never self-approves", async () => {
  const tx = convexTest(schema, modules);
  const world = await seedKetamineWorld(tx);
  const before = await world.provider.query(
    api.domains.ketamine.getCourseReadiness,
    { courseId: world.courseId },
  );
  expect(before.ready).toBe(false);
  expect(before.clearanceApproved).toBe(false);
  // Default prerequisites apply when none are configured.
  expect(before.items.map((i) => i.key)).toEqual([
    "consent",
    "baselineData",
    "escort",
  ]);

  await activateCourse(world);
  for (const key of ["consent", "baselineData", "escort"]) {
    await world.clinicalStaff.mutation(
      api.domains.ketamine.markPrerequisiteSatisfied,
      { courseId: world.courseId, key },
    );
  }
  // Marking twice is idempotent.
  await world.clinicalStaff.mutation(
    api.domains.ketamine.markPrerequisiteSatisfied,
    { courseId: world.courseId, key: "consent" },
  );
  const after = await world.provider.query(
    api.domains.ketamine.getCourseReadiness,
    { courseId: world.courseId },
  );
  expect(after.ready).toBe(true);
  await expect(
    world.clinicalStaff.mutation(
      api.domains.ketamine.markPrerequisiteSatisfied,
      { courseId: world.courseId, key: "notAThing" },
    ),
  ).rejects.toThrow("Unknown prerequisite");
});

test("configured protocol items replace defaults and are admin-only", async () => {
  const tx = convexTest(schema, modules);
  const world = await seedKetamineWorld(tx);
  await expect(
    world.clinicalStaff.mutation(api.domains.ketamine.setProtocolItem, {
      kind: "prerequisite",
      key: "vitals",
      label: "Baseline vitals",
      active: true,
    }),
  ).rejects.toThrow("Not authorized");
  const admin = await seedUser(tx, ["administrator"], "ket_admin");
  await admin.mutation(api.domains.ketamine.setProtocolItem, {
    kind: "prerequisite",
    key: "vitals",
    label: "Baseline vitals",
    active: true,
  });
  const readiness = await world.provider.query(
    api.domains.ketamine.getCourseReadiness,
    { courseId: world.courseId },
  );
  expect(readiness.items.map((i) => i.key)).toEqual(["vitals"]);
});
