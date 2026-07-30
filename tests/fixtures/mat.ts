// Synthetic MAT fixtures — never real data.
import type { convexTest } from "convex-test";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { seedUser } from "./forms";
import { seedPatients } from "./patients";
import { seedSchedulingWorld, type SchedulingWorld } from "./scheduling";

export interface MatWorld extends SchedulingWorld {
  patientId: Id<"patients">;
  episodeId: Id<"matEpisodes">;
  provider: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>;
  clinicalStaff: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>;
}

/** Scheduling world plus one patient with an active MAT episode. */
export async function seedMatWorld(
  tx: ReturnType<typeof convexTest>,
): Promise<MatWorld> {
  const world = await seedSchedulingWorld(tx);
  const [patientId] = await seedPatients(tx);
  const clinicalStaff = await seedUser(tx, ["clinicalStaff"], "mat_staff");
  const provider = tx.withIdentity({ subject: "user_fixture_provider" });
  const episodeId = await provider.mutation(api.domains.mat.createEpisode, {
    patientId: patientId!,
    providerId: world.providerId,
  });
  return {
    ...world,
    patientId: patientId!,
    episodeId,
    provider,
    clinicalStaff,
  };
}
