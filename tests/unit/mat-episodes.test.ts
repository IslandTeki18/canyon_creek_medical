// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedMatWorld } from "../fixtures/mat";

const modules = import.meta.glob("../../convex/**/*.ts");

test("only mat.access roles can read or write MAT episodes", async () => {
  const tx = convexTest(schema, modules);
  const { patientId, providerId, episodeId } = await seedMatWorld(tx);
  for (const [roles, name] of [
    [["frontDesk"], "mat_front_desk"],
    [["administrator"], "mat_admin"],
    [["patient"], "mat_patient_user"],
    [["auditor"], "mat_auditor"],
  ] as const) {
    const denied = await seedUser(tx, [...roles], name);
    await expect(
      denied.mutation(api.domains.mat.createEpisode, {
        patientId,
        providerId,
      }),
    ).rejects.toThrow("Not authorized");
    await expect(
      denied.query(api.domains.mat.getEpisode, { episodeId }),
    ).rejects.toThrow("Not authorized");
    await expect(
      denied.query(api.domains.mat.listEpisodesForPatient, { patientId }),
    ).rejects.toThrow("Not authorized");
  }
  const staff = tx.withIdentity({ subject: "mat_staff" });
  const episode = await staff.query(api.domains.mat.getEpisode, { episodeId });
  expect(episode?.state).toBe("active");
});

test("episode states follow allowed transitions and are audited", async () => {
  const tx = convexTest(schema, modules);
  const { provider, patientId, providerId, episodeId } = await seedMatWorld(tx);
  await expect(
    provider.mutation(api.domains.mat.createEpisode, {
      patientId,
      providerId,
    }),
  ).rejects.toThrow("already has an active MAT episode");
  await expect(
    provider.mutation(api.domains.mat.setEpisodeState, {
      episodeId,
      state: "paused",
      reason: "  ",
    }),
  ).rejects.toThrow("reason is required");
  await provider.mutation(api.domains.mat.setEpisodeState, {
    episodeId,
    state: "completed",
    reason: "Synthetic completion",
  });
  await expect(
    provider.mutation(api.domains.mat.setEpisodeState, {
      episodeId,
      state: "active",
      reason: "Invalid revival",
    }),
  ).rejects.toThrow("Cannot move episode");
  const audits = await tx.run((ctx) =>
    ctx.db
      .query("auditEvents")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "matEpisodes").eq("entityId", episodeId),
      )
      .collect(),
  );
  expect(audits.map((a) => a.action)).toEqual([
    "mat.episode.created",
    "mat.episode.completed",
  ]);
});
