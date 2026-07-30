// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedMatWorld } from "../fixtures/mat";

const modules = import.meta.glob("../../convex/**/*.ts");

const FIELDS = [
  {
    key: "substanceUseHistory",
    value: "Synthetic patient-reported history",
    source: "patient" as const,
  },
  {
    key: "recoverySupports",
    value: "Synthetic clinician-entered supports",
    source: "clinician" as const,
  },
];

test("intake carries provenance and provider review verifies fields", async () => {
  const tx = convexTest(schema, modules);
  const { clinicalStaff, provider, episodeId } = await seedMatWorld(tx);
  const assessmentId = await clinicalStaff.mutation(
    api.domains.mat.recordIntake,
    { episodeId, fields: FIELDS },
  );
  await expect(
    clinicalStaff.mutation(api.domains.mat.recordIntake, {
      episodeId,
      fields: [{ key: "notAField", value: "x", source: "patient" }],
    }),
  ).rejects.toThrow("Unknown intake field");

  // Clinical staff cannot perform the provider review.
  await expect(
    clinicalStaff.mutation(api.domains.mat.reviewIntake, {
      assessmentId,
      verifiedKeys: [],
    }),
  ).rejects.toThrow("Not authorized");

  await provider.mutation(api.domains.mat.reviewIntake, {
    assessmentId,
    verifiedKeys: ["substanceUseHistory"],
    followUpQuestions: "Synthetic follow-up question",
  });
  const [intake] = await provider.query(api.domains.mat.listIntakeForEpisode, {
    episodeId,
  });
  expect(intake?.reviewStatus).toBe("reviewed");
  expect(
    intake?.fields.find((f) => f.key === "substanceUseHistory"),
  ).toMatchObject({ source: "patient", clinicianVerified: true });
  await expect(
    provider.mutation(api.domains.mat.reviewIntake, {
      assessmentId,
      verifiedKeys: [],
    }),
  ).rejects.toThrow("already reviewed");
});

test("intake content is unreachable without mat.access", async () => {
  const tx = convexTest(schema, modules);
  const { clinicalStaff, episodeId } = await seedMatWorld(tx);
  await clinicalStaff.mutation(api.domains.mat.recordIntake, {
    episodeId,
    fields: FIELDS,
  });
  const frontDesk = await seedUser(tx, ["frontDesk"], "mat_intake_fd");
  await expect(
    frontDesk.query(api.domains.mat.listIntakeForEpisode, { episodeId }),
  ).rejects.toThrow("Not authorized");
  await expect(
    frontDesk.mutation(api.domains.mat.recordIntake, {
      episodeId,
      fields: FIELDS,
    }),
  ).rejects.toThrow("Not authorized");
});
