// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { ROLES, hasCapability, type Role } from "../../convex/lib/permissions";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

async function seedUser(
  tx: ReturnType<typeof convexTest>,
  clerkUserId: string,
  roles: Role[],
  status: "active" | "suspended" | "deactivated" = "active",
) {
  await tx.run(async (ctx) => {
    await ctx.db.insert("users", {
      clerkUserId,
      type: roles.includes("patient") ? "patient" : "workforce",
      status,
      roles,
      displayName: `Synthetic ${roles.join("/") || "roleless"}`,
      createdAt: 0,
      updatedAt: 0,
    });
  });
}

// Only administrators hold user.manage in the initial capability map.
const DENIED_ROLES = ROLES.filter((r) => r !== "administrator");

test.each(DENIED_ROLES.map((r) => [r]))(
  "listWorkforceUsers denies role %s server-side",
  async (role) => {
    const tx = convexTest(schema, modules);
    await seedUser(tx, `user_${role}`, [role]);
    await expect(
      tx
        .withIdentity({ subject: `user_${role}` })
        .query(api.domains.workforce.listWorkforceUsers, {}),
    ).rejects.toThrow("Not authorized");
  },
);

test("listWorkforceUsers allows administrators", async () => {
  const tx = convexTest(schema, modules);
  await seedUser(tx, "user_admin", ["administrator"]);
  const result = await tx
    .withIdentity({ subject: "user_admin" })
    .query(api.domains.workforce.listWorkforceUsers, {});
  expect(result).toHaveLength(1);
});

test("unauthenticated and unknown identities are rejected", async () => {
  const tx = convexTest(schema, modules);
  await expect(
    tx.query(api.domains.workforce.listWorkforceUsers, {}),
  ).rejects.toThrow("Not authenticated");
  await expect(
    tx
      .withIdentity({ subject: "user_never_synced" })
      .query(api.domains.workforce.listWorkforceUsers, {}),
  ).rejects.toThrow("Not authenticated");
});

test.each([["suspended"], ["deactivated"]] as const)(
  "%s users are denied even with a live session",
  async (status) => {
    const tx = convexTest(schema, modules);
    await seedUser(tx, "user_stale", ["administrator"], status);
    await expect(
      tx
        .withIdentity({ subject: "user_stale" })
        .query(api.domains.workforce.listWorkforceUsers, {}),
    ).rejects.toThrow("Account is not active");
  },
);

test("capability map matches expected boundaries", () => {
  expect(hasCapability(["provider"], "encounter.sign")).toBe(true);
  expect(hasCapability(["clinicalStaff"], "encounter.sign")).toBe(false);
  expect(hasCapability(["auditor"], "audit.view")).toBe(true);
  expect(hasCapability(["auditor"], "patient.read")).toBe(false);
  expect(hasCapability(["patient"], "patient.read")).toBe(false);
  expect(hasCapability([], "portal.access")).toBe(false);
});
