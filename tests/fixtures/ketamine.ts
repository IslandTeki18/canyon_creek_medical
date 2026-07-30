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
