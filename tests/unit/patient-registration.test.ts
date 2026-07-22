// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Role } from "../../convex/lib/permissions";
import schema from "../../convex/schema";
import { seedPatients } from "../fixtures/patients";

const modules = import.meta.glob("../../convex/**/*.ts");

function seedStaff(
  tx: ReturnType<typeof convexTest>,
  roles: Role[] = ["frontDesk"],
  clerkUserId = "user_staff",
) {
  return tx
    .run((ctx) =>
      ctx.db.insert("users", {
        clerkUserId,
        type: "workforce",
        status: "active",
        roles,
        displayName: "Synthetic Staff",
        createdAt: 0,
        updatedAt: 0,
      }),
    )
    .then(() => tx.withIdentity({ subject: clerkUserId }));
}

const newPatient = {
  legalFirstName: "Drew",
  legalLastName: "Examplar",
  dateOfBirth: "1990-06-20",
  email: "drew.examplar@example.com",
  phone: "555-010-2000",
  communicationPreference: {
    smsOptIn: true,
    emailOptIn: true,
    voiceOptIn: false,
    preferredChannel: "sms" as const,
  },
  acknowledgedDuplicates: false,
};

test("front desk creates a patient with communication preferences and audit", async () => {
  const tx = convexTest(schema, modules);
  const staff = await seedStaff(tx);
  const result = await staff.mutation(
    api.domains.patients.createPatient,
    newPatient,
  );
  expect(result.created).toBe(true);
  const { prefs, audits } = await tx.run(async (ctx) => ({
    prefs: await ctx.db.query("communicationPreferences").collect(),
    audits: await ctx.db.query("auditEvents").collect(),
  }));
  expect(prefs).toHaveLength(1);
  expect(audits.some((a) => a.action === "patient.created")).toBe(true);
});

test("duplicate candidates block creation until acknowledged", async () => {
  const tx = convexTest(schema, modules);
  await seedPatients(tx);
  const staff = await seedStaff(tx);
  const dup = {
    ...newPatient,
    legalFirstName: "Avery2",
    legalLastName: "Testerson",
    dateOfBirth: "1985-03-14",
    email: undefined,
    phone: undefined,
  };
  const blocked = await staff.mutation(api.domains.patients.createPatient, dup);
  expect(blocked.created).toBe(false);
  if (!blocked.created) expect(blocked.duplicates.length).toBeGreaterThan(0);

  const created = await staff.mutation(api.domains.patients.createPatient, {
    ...dup,
    acknowledgedDuplicates: true,
  });
  expect(created.created).toBe(true);
  const audit = await tx.run((ctx) => ctx.db.query("auditEvents").collect());
  expect(
    audit.some(
      (a) =>
        a.action === "patient.created" &&
        a.reason?.includes("acknowledging possible duplicates"),
    ),
  ).toBe(true);
});

test("duplicate matching also works by email and phone", async () => {
  const tx = convexTest(schema, modules);
  await seedPatients(tx);
  const staff = await seedStaff(tx);
  const byEmail = await staff.query(api.domains.patients.duplicateCandidates, {
    legalLastName: "Unrelated",
    dateOfBirth: "2000-01-01",
    email: "AVERY.TESTERSON@example.com",
  });
  expect(byEmail).toHaveLength(1);
  const byPhone = await staff.query(api.domains.patients.duplicateCandidates, {
    legalLastName: "Unrelated",
    dateOfBirth: "2000-01-01",
    phone: "(555) 010-1003",
  });
  expect(byPhone).toHaveLength(1);
});

test("server-side validation rejects bad identity input", async () => {
  const tx = convexTest(schema, modules);
  const staff = await seedStaff(tx);
  await expect(
    staff.mutation(api.domains.patients.createPatient, {
      ...newPatient,
      dateOfBirth: "06/20/1990",
    }),
  ).rejects.toThrow("Date of birth");
  await expect(
    staff.mutation(api.domains.patients.createPatient, {
      ...newPatient,
      legalFirstName: "  ",
    }),
  ).rejects.toThrow("name");
});

test.each([["patient"], ["auditor"]] as const)(
  "role %s cannot create patients or search duplicates",
  async (role) => {
    const tx = convexTest(schema, modules);
    const user = await seedStaff(tx, [role], `user_${role}`);
    await expect(
      user.mutation(api.domains.patients.createPatient, newPatient),
    ).rejects.toThrow("Not authorized");
    await expect(
      user.query(api.domains.patients.duplicateCandidates, {
        legalLastName: "x",
        dateOfBirth: "1990-01-01",
      }),
    ).rejects.toThrow("Not authorized");
  },
);
