// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createSelfLink } from "../../convex/lib/access";
import schema from "../../convex/schema";
import { seedPatients } from "../fixtures/patients";

const modules = import.meta.glob("../../convex/**/*.ts");

async function seedPatientUser(
  tx: ReturnType<typeof convexTest>,
  clerkUserId: string,
) {
  const userId = await tx.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId,
      type: "patient" as const,
      status: "active" as const,
      roles: ["patient" as const],
      displayName: `Synthetic ${clerkUserId}`,
      createdAt: 0,
      updatedAt: 0,
    }),
  );
  return { userId, as: tx.withIdentity({ subject: clerkUserId }) };
}

test("portal home is null when unlinked and scoped to own patient when linked", async () => {
  const tx = convexTest(schema, modules);
  const [averyId] = await seedPatients(tx);
  const { userId, as: patient } = await seedPatientUser(tx, "user_portal");

  expect(await patient.query(api.domains.portal.myPortalHome, {})).toBeNull();

  await tx.run((ctx) =>
    createSelfLink(ctx, {
      patientId: averyId,
      userId,
      verificationMethod: "invitation",
    }),
  );

  const home = await patient.query(api.domains.portal.myPortalHome, {});
  expect(home?.displayName).toBe("Ave"); // preferred name, own record only
  expect(home?.profileComplete).toBe(false);
  const phone = home?.profileChecklist.find((i) => i.label === "Phone number");
  expect(phone?.complete).toBe(true);
});

test("unauthenticated callers cannot read portal home", async () => {
  const tx = convexTest(schema, modules);
  await expect(tx.query(api.domains.portal.myPortalHome, {})).rejects.toThrow(
    "Not authenticated",
  );
});
