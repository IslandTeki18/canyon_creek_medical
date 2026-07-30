// Synthetic ketamine fixtures — never real data.
import type { convexTest } from "convex-test";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { seedUser } from "./forms";
import { seedPatients } from "./patients";
import { seedSchedulingWorld, type SchedulingWorld } from "./scheduling";

export interface KetamineWorld extends SchedulingWorld {
  patientId: Id<"patients">;
  courseId: Id<"ketamineCourses">;
  provider: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>;
  clinicalStaff: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>;
}

/** Scheduling world plus one patient with a ketamine course in screening. */
export async function seedKetamineWorld(
  tx: ReturnType<typeof convexTest>,
): Promise<KetamineWorld> {
  const world = await seedSchedulingWorld(tx);
  const [patientId] = await seedPatients(tx);
  const clinicalStaff = await seedUser(tx, ["clinicalStaff"], "ket_staff");
  const provider = tx.withIdentity({ subject: "user_fixture_provider" });
  const courseId = await provider.mutation(api.domains.ketamine.createCourse, {
    patientId: patientId!,
    approvingProviderId: world.providerId,
  });
  return {
    ...world,
    patientId: patientId!,
    courseId,
    provider,
    clinicalStaff,
  };
}

/**
 * Active course with prerequisites satisfied plus one session brought all
 * the way to "ready" (checklist complete, baseline vitals recorded).
 */
export async function seedReadySession(
  tx: ReturnType<typeof convexTest>,
): Promise<{ world: KetamineWorld; sessionId: Id<"ketamineSessions"> }> {
  const world = await seedKetamineWorld(tx);
  await activateCourse(world);
  for (const key of ["consent", "baselineData", "escort"]) {
    await world.clinicalStaff.mutation(
      api.domains.ketamine.markPrerequisiteSatisfied,
      { courseId: world.courseId, key },
    );
  }
  const sessionId = await world.provider.mutation(
    api.domains.ketamine.createSession,
    { courseId: world.courseId },
  );
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
  await world.clinicalStaff.mutation(api.domains.ketamine.markSessionReady, {
    sessionId,
  });
  return { world, sessionId };
}

/** Approves clearance and activates the course. */
export async function activateCourse(world: KetamineWorld): Promise<void> {
  await world.provider.mutation(api.domains.ketamine.recordClearance, {
    courseId: world.courseId,
    decision: "approved",
    rationale: "Synthetic clearance for testing",
  });
  await world.provider.mutation(api.domains.ketamine.setCourseState, {
    courseId: world.courseId,
    state: "active",
    reason: "Cleared",
  });
}
