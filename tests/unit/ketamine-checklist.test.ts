// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { activateCourse, seedKetamineWorld } from "../fixtures/ketamine";

const modules = import.meta.glob("../../convex/**/*.ts");

async function seedSession(tx: ReturnType<typeof convexTest>) {
  const world = await seedKetamineWorld(tx);
  await activateCourse(world);
  for (const key of ["consent", "baselineData", "escort"]) {
    await world.clinicalStaff.mutation(
      api.domains.ketamine.markPrerequisiteSatisfied,
      { courseId: world.courseId, key },
    );
  }
  const sessionId: Id<"ketamineSessions"> = await world.provider.mutation(
    api.domains.ketamine.createSession,
    { courseId: world.courseId },
  );
  return { world, sessionId };
}

/** Completes the default checklist and baseline vitals. */
export async function completeChecklist(
  world: Awaited<ReturnType<typeof seedSession>>["world"],
  sessionId: Id<"ketamineSessions">,
) {
  for (const key of ["medicationConfirmed", "escortConfirmed"]) {
    await world.clinicalStaff.mutation(api.domains.ketamine.setChecklistItem, {
      sessionId,
      key,
      complete: true,
    });
  }
  await world.clinicalStaff.mutation(api.domains.ketamine.recordVitals, {
    sessionId,
    phase: "baseline",
    systolic: 120,
    diastolic: 78,
    heartRate: 72,
    spo2: 99,
  });
}

test("ready is blocked with reasons until every required item is complete", async () => {
  const tx = convexTest(schema, modules);
  const { world, sessionId } = await seedSession(tx);
  const before = await world.clinicalStaff.query(
    api.domains.ketamine.getSessionReadiness,
    { sessionId },
  );
  expect(before.ready).toBe(false);
  expect(before.reasons).toEqual([
    "Checklist: Medication details confirmed",
    "Checklist: Transportation or escort confirmed",
    "Baseline vitals are not recorded",
  ]);
  await expect(
    world.clinicalStaff.mutation(api.domains.ketamine.markSessionReady, {
      sessionId,
    }),
  ).rejects.toThrow("Session is not ready");

  await completeChecklist(world, sessionId);
  await world.clinicalStaff.mutation(api.domains.ketamine.markSessionReady, {
    sessionId,
  });
  // Unchecking an item drops the session back to planned.
  await world.clinicalStaff.mutation(api.domains.ketamine.setChecklistItem, {
    sessionId,
    key: "escortConfirmed",
    complete: false,
  });
  const session = await tx.run((ctx) => ctx.db.get(sessionId));
  expect(session?.state).toBe("planned");
});

test("override requires sign capability and a reason, and is audited", async () => {
  const tx = convexTest(schema, modules);
  const { world, sessionId } = await seedSession(tx);
  // clinicalStaff cannot override.
  await expect(
    world.clinicalStaff.mutation(api.domains.ketamine.markSessionReady, {
      sessionId,
      overrideReason: "Front desk override",
    }),
  ).rejects.toThrow("Not authorized");
  await expect(
    world.provider.mutation(api.domains.ketamine.markSessionReady, {
      sessionId,
      overrideReason: " ",
    }),
  ).rejects.toThrow("reason is required");
  await world.provider.mutation(api.domains.ketamine.markSessionReady, {
    sessionId,
    overrideReason: "Escort verified verbally; documented after outage",
  });
  const audit = await tx.run((ctx) =>
    ctx.db
      .query("auditEvents")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "ketamineSessions").eq("entityId", sessionId),
      )
      .collect(),
  );
  expect(
    audit.some((e) => e.action === "ketamine.session.ready_override"),
  ).toBe(true);
});

test("vitals are validated and phase-gated", async () => {
  const tx = convexTest(schema, modules);
  const { world, sessionId } = await seedSession(tx);
  await expect(
    world.clinicalStaff.mutation(api.domains.ketamine.recordVitals, {
      sessionId,
      phase: "baseline",
      systolic: 0,
      diastolic: 78,
      heartRate: 72,
    }),
  ).rejects.toThrow("Systolic is out of range");
  await expect(
    world.clinicalStaff.mutation(api.domains.ketamine.recordVitals, {
      sessionId,
      phase: "monitoring",
      systolic: 120,
      diastolic: 78,
      heartRate: 72,
    }),
  ).rejects.toThrow("Monitoring vitals require a started session");
});
