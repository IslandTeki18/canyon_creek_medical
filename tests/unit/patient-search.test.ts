// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { seedPatients } from "../fixtures/patients";

const modules = import.meta.glob("../../convex/**/*.ts");

const page = { numItems: 10, cursor: null };

async function seedReader(tx: ReturnType<typeof convexTest>) {
  await tx.run(async (ctx) => {
    await ctx.db.insert("users", {
      clerkUserId: "user_reader",
      type: "workforce",
      status: "active",
      roles: ["clinicalStaff"],
      displayName: "Synthetic Reader",
      createdAt: 0,
      updatedAt: 0,
    });
  });
  return tx.withIdentity({ subject: "user_reader" });
}

test("searches by name, email, and phone via indexes", async () => {
  const tx = convexTest(schema, modules);
  await seedPatients(tx);
  const reader = await seedReader(tx);

  const byName = await reader.query(api.domains.patients.searchPatients, {
    term: "testerson",
    paginationOpts: page,
  });
  expect(byName.page).toHaveLength(2);

  const byEmail = await reader.query(api.domains.patients.searchPatients, {
    term: "Blake.Sampleton@example.com",
    paginationOpts: page,
  });
  expect(byEmail.page).toHaveLength(1);
  expect(byEmail.page[0].legalFirstName).toBe("Blake");

  const byPhone = await reader.query(api.domains.patients.searchPatients, {
    term: "(555) 010-1003",
    paginationOpts: page,
  });
  expect(byPhone.page).toHaveLength(1);
  expect(byPhone.page[0].legalFirstName).toBe("Casey");
});

test("empty term lists by status; archived are excluded from active filter", async () => {
  const tx = convexTest(schema, modules);
  const [averyId] = await seedPatients(tx);
  await tx.run((ctx) => ctx.db.patch(averyId, { status: "archived" }));
  const reader = await seedReader(tx);

  const active = await reader.query(api.domains.patients.searchPatients, {
    term: "",
    status: "active",
    paginationOpts: page,
  });
  expect(active.page).toHaveLength(2);

  const archived = await reader.query(api.domains.patients.searchPatients, {
    term: "",
    status: "archived",
    paginationOpts: page,
  });
  expect(archived.page).toHaveLength(1);
});

test("registry rows expose only minimal identifying fields", async () => {
  const tx = convexTest(schema, modules);
  await seedPatients(tx);
  const reader = await seedReader(tx);
  const result = await reader.query(api.domains.patients.searchPatients, {
    term: "",
    paginationOpts: page,
  });
  const allowed = new Set([
    "_id",
    "dateOfBirth",
    "email",
    "legalFirstName",
    "legalLastName",
    "phone",
    "preferredName",
    "status",
  ]);
  for (const row of result.page) {
    for (const key of Object.keys(row)) {
      expect(allowed.has(key), `unexpected field ${key}`).toBe(true);
    }
  }
});

test("patient and auditor roles cannot search the registry", async () => {
  const tx = convexTest(schema, modules);
  await seedPatients(tx);
  for (const role of ["patient", "auditor"] as const) {
    await tx.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkUserId: `user_${role}`,
        type: role === "patient" ? "patient" : "workforce",
        status: "active",
        roles: [role],
        displayName: `Synthetic ${role}`,
        createdAt: 0,
        updatedAt: 0,
      });
    });
    await expect(
      tx
        .withIdentity({ subject: `user_${role}` })
        .query(api.domains.patients.searchPatients, {
          term: "",
          paginationOpts: page,
        }),
    ).rejects.toThrow("Not authorized");
  }
});
