// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { createSelfLink } from "../../convex/lib/access";
import schema from "../../convex/schema";
import { seedPatients } from "../fixtures/patients";

const modules = import.meta.glob("../../convex/**/*.ts");

async function seedPatientUser(
  tx: ReturnType<typeof convexTest>,
  clerkUserId: string,
): Promise<Id<"users">> {
  return await tx.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId,
      type: "patient",
      status: "active",
      roles: ["patient"],
      displayName: `Synthetic ${clerkUserId}`,
      createdAt: 0,
      updatedAt: 0,
    }),
  );
}

test("one active self link per user and per patient", async () => {
  const tx = convexTest(schema, modules);
  const [patientA, patientB] = await seedPatients(tx);
  const userA = await seedPatientUser(tx, "user_link_a");
  const userB = await seedPatientUser(tx, "user_link_b");

  await tx.run((ctx) =>
    createSelfLink(ctx, {
      patientId: patientA,
      userId: userA,
      verificationMethod: "invitation",
    }),
  );

  // Same user cannot link to a second patient.
  await expect(
    tx.run((ctx) =>
      createSelfLink(ctx, {
        patientId: patientB,
        userId: userA,
        verificationMethod: "invitation",
      }),
    ),
  ).rejects.toThrow("already linked");

  // Same patient cannot gain a second self account.
  await expect(
    tx.run((ctx) =>
      createSelfLink(ctx, {
        patientId: patientA,
        userId: userB,
        verificationMethod: "invitation",
      }),
    ),
  ).rejects.toThrow("already has a linked account");
});

test("revoked link frees the patient for a new self link", async () => {
  const tx = convexTest(schema, modules);
  const [patientA] = await seedPatients(tx);
  const userA = await seedPatientUser(tx, "user_link_c");
  const userB = await seedPatientUser(tx, "user_link_d");

  const linkId = await tx.run((ctx) =>
    createSelfLink(ctx, {
      patientId: patientA,
      userId: userA,
      verificationMethod: "invitation",
    }),
  );
  await tx.run((ctx) =>
    ctx.db.patch(linkId, { status: "revoked", updatedAt: 1 }),
  );
  await expect(
    tx.run((ctx) =>
      createSelfLink(ctx, {
        patientId: patientA,
        userId: userB,
        verificationMethod: "invitation",
      }),
    ),
  ).resolves.toBeDefined();
});
