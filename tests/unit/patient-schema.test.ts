// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import {
  buildSearchText,
  isValidDateOfBirth,
  normalizeEmail,
  normalizeName,
  normalizePhone,
} from "../../convex/lib/patients";
import schema from "../../convex/schema";
import { seedPatients } from "../fixtures/patients";

const modules = import.meta.glob("../../convex/**/*.ts");

test("normalization helpers", () => {
  expect(normalizeName("  Testerson ")).toBe("testerson");
  expect(normalizePhone("(555) 010-1001")).toBe("5550101001");
  expect(normalizePhone("")).toBeUndefined();
  expect(normalizeEmail(" Avery@Example.COM ")).toBe("avery@example.com");
  expect(isValidDateOfBirth("1985-03-14")).toBe(true);
  expect(isValidDateOfBirth("3000-01-01")).toBe(false);
  expect(isValidDateOfBirth("03/14/1985")).toBe(false);
  expect(
    buildSearchText({
      legalFirstName: "Avery",
      legalLastName: "Testerson",
      preferredName: "Ave",
      dateOfBirth: "1985-03-14",
    }),
  ).toBe("avery ave testerson 1985-03-14");
});

test("indexes support name+dob, email, and phone lookups", async () => {
  const tx = convexTest(schema, modules);
  await seedPatients(tx);
  const { byName, byEmail, byPhone } = await tx.run(async (ctx) => ({
    byName: await ctx.db
      .query("patients")
      .withIndex("by_last_name", (q) =>
        q.eq("normalizedLastName", "testerson").eq("dateOfBirth", "1985-03-14"),
      )
      .collect(),
    byEmail: await ctx.db
      .query("patients")
      .withIndex("by_email", (q) =>
        q.eq("normalizedEmail", "blake.sampleton@example.com"),
      )
      .collect(),
    byPhone: await ctx.db
      .query("patients")
      .withIndex("by_phone", (q) => q.eq("normalizedPhone", "5550101003"))
      .collect(),
  }));
  expect(byName).toHaveLength(2); // Avery and Casey share name + DOB
  expect(byEmail).toHaveLength(1);
  expect(byPhone).toHaveLength(1);
});

test("search index matches partial identity text and respects status filter", async () => {
  const tx = convexTest(schema, modules);
  const [averyId] = await seedPatients(tx);
  await tx.run(async (ctx) => {
    await ctx.db.patch(averyId, { status: "archived" });
  });
  const results = await tx.run((ctx) =>
    ctx.db
      .query("patients")
      .withSearchIndex("search", (q) =>
        q.search("searchText", "testerson").eq("status", "active"),
      )
      .collect(),
  );
  expect(results).toHaveLength(1);
  expect(results[0].legalFirstName).toBe("Casey");
});
