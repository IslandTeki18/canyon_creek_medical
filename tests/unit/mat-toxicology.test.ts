// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedMatWorld } from "../fixtures/mat";

const modules = import.meta.glob("../../convex/**/*.ts");

test("corrections preserve the original and restart review", async () => {
  const tx = convexTest(schema, modules);
  const { clinicalStaff, provider, episodeId } = await seedMatWorld(tx);
  const recordId = await clinicalStaff.mutation(
    api.domains.mat.recordToxicology,
    {
      episodeId,
      specimenDate: "2026-07-20",
      specimenType: "urine",
      source: "in-office",
      status: "pending",
      resultSummary: "Synthetic initial summary",
    },
  );
  await provider.mutation(api.domains.mat.reviewToxicology, { recordId });

  const correctionId = await clinicalStaff.mutation(
    api.domains.mat.correctToxicology,
    {
      recordId,
      reason: "Transcription error in summary",
      resultSummary: "Synthetic corrected summary",
    },
  );
  const records = await provider.query(
    api.domains.mat.listToxicologyForEpisode,
    { episodeId },
  );
  const original = records.find((r) => r._id === recordId);
  const correction = records.find((r) => r._id === correctionId);
  expect(original?.resultSummary).toBe("Synthetic initial summary");
  expect(original?.supersededById).toBe(correctionId);
  expect(correction?.supersedesId).toBe(recordId);
  expect(correction?.status).toBe("pending"); // review restarts

  // Superseded records cannot be corrected or reviewed again.
  await expect(
    clinicalStaff.mutation(api.domains.mat.correctToxicology, {
      recordId,
      reason: "Second correction of superseded record",
    }),
  ).rejects.toThrow("already been corrected");
  await expect(
    provider.mutation(api.domains.mat.reviewToxicology, { recordId }),
  ).rejects.toThrow("corrected record cannot be reviewed");

  // Status queue excludes superseded rows.
  const pending = await provider.query(api.domains.mat.listToxicologyByStatus, {
    status: "pending",
  });
  expect(pending.map((r) => r._id)).toEqual([correctionId]);
});

test("toxicology results are restricted to mat.access; review needs a provider", async () => {
  const tx = convexTest(schema, modules);
  const { clinicalStaff, episodeId } = await seedMatWorld(tx);
  const recordId = await clinicalStaff.mutation(
    api.domains.mat.recordToxicology,
    {
      episodeId,
      specimenDate: "2026-07-21",
      specimenType: "urine",
      source: "external lab",
      status: "pending",
    },
  );
  await expect(
    clinicalStaff.mutation(api.domains.mat.reviewToxicology, { recordId }),
  ).rejects.toThrow("Not authorized");
  const frontDesk = await seedUser(tx, ["frontDesk"], "mat_tox_fd");
  await expect(
    frontDesk.query(api.domains.mat.listToxicologyForEpisode, { episodeId }),
  ).rejects.toThrow("Not authorized");
  await expect(
    frontDesk.query(api.domains.mat.listToxicologyByStatus, {
      status: "pending",
    }),
  ).rejects.toThrow("Not authorized");
});
