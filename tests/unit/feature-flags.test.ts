// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedPatients } from "../fixtures/patients";

const modules = import.meta.glob("../../convex/**/*.ts");

afterEach(() => {
  delete process.env.APP_ENV;
});

test("flags fall back to environment defaults and report them", async () => {
  const tx = convexTest(schema, modules);
  const admin = await seedUser(tx, ["administrator"], "flag_admin");
  const flags = await admin.query(api.domains.featureFlags.listFlags, {});
  const byKey = Object.fromEntries(flags.map((flag) => [flag.key, flag]));

  // Deferred clinical modules are off everywhere until approved.
  expect(byKey.spravato?.enabled).toBe(false);
  expect(byKey.spravato?.regulated).toBe(true);
  expect(byKey.spravato?.overridden).toBe(false);
  // Outbound integrations default on for a developer deployment.
  expect(byKey.integrations?.enabled).toBe(true);
  expect(byKey.integrations?.environment).toBe("development");
});

test("only config.manage may change a flag, and unknown keys are refused", async () => {
  const tx = convexTest(schema, modules);
  const admin = await seedUser(tx, ["administrator"], "flag_admin_2");
  const provider = await seedUser(tx, ["provider"], "flag_provider");

  await expect(
    provider.mutation(api.domains.featureFlags.setFlag, {
      key: "spravato",
      enabled: true,
      reason: "I would like this on",
    }),
  ).rejects.toThrow("Not authorized");
  await expect(
    admin.mutation(api.domains.featureFlags.setFlag, {
      key: "notAFlag",
      enabled: true,
      reason: "Typo",
    }),
  ).rejects.toThrow("Unknown feature flag");
  await expect(
    admin.mutation(api.domains.featureFlags.setFlag, {
      key: "spravato",
      enabled: true,
      reason: "  ",
    }),
  ).rejects.toThrow("A reason is required");

  // A provider can read flag state but changing it stays server-owned.
  expect(
    (await provider.query(api.domains.featureFlags.listFlags, {})).length,
  ).toBeGreaterThan(0);
});

test("regulated modules need an approval record to go live in production", async () => {
  const tx = convexTest(schema, modules);
  const admin = await seedUser(tx, ["administrator"], "flag_admin_3");
  process.env.APP_ENV = "production";

  await expect(
    admin.mutation(api.domains.featureFlags.setFlag, {
      key: "hbot",
      enabled: true,
      reason: "Equipment installed",
    }),
  ).rejects.toThrow("requires an approval record");

  // Non-regulated modules need no approval record.
  await admin.mutation(api.domains.featureFlags.setFlag, {
    key: "secureMessaging",
    enabled: true,
    reason: "Messaging policy approved",
  });

  await admin.mutation(api.domains.featureFlags.setFlag, {
    key: "hbot",
    enabled: true,
    reason: "Equipment installed",
    approval: {
      reference: "SYNTH-APPROVAL-1",
      approvedBy: "Synthetic Clinical Owner",
      approvedAt: 1_700_000_000_000,
    },
  });
  const flags = await admin.query(api.domains.featureFlags.listFlags, {});
  const hbot = flags.find((flag) => flag.key === "hbot");
  expect(hbot?.enabled).toBe(true);
  expect(hbot?.approval?.reference).toBe("SYNTH-APPROVAL-1");

  const audit = await tx.run(async (ctx) =>
    (await ctx.db.query("auditEvents").collect()).map((event) => event.action),
  );
  expect(audit.filter((a) => a === "feature_flag.enabled")).toHaveLength(2);
});

test("a disabled flag stops the backend operation regardless of the client", async () => {
  const tx = convexTest(schema, modules);
  const admin = await seedUser(tx, ["administrator"], "flag_admin_4");
  const [patientId] = await seedPatients(tx);
  // A pending job that would otherwise be claimed and sent.
  await tx.run(async (ctx) => {
    const userId = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", "flag_admin_4"))
      .unique();
    const templateId = await ctx.db.insert("messageTemplates", {
      name: "Reminder",
      intent: "appointmentReminder",
      channel: "email" as const,
      status: "active" as const,
      createdByUserId: userId!._id,
      createdAt: 0,
      updatedAt: 0,
    });
    const versionId = await ctx.db.insert("messageTemplateVersions", {
      templateId,
      version: 1,
      status: "published" as const,
      body: "Appointment with the practice.",
      createdByUserId: userId!._id,
      createdAt: 0,
      updatedAt: 0,
    });
    await ctx.db.insert("communicationJobs", {
      patientId: patientId!,
      templateVersionId: versionId,
      intent: "appointmentReminder",
      channel: "email" as const,
      destination: "synthetic@example.com",
      scheduledAt: 0,
      idempotencyKey: "flag-test-key",
      status: "pending" as const,
      retryCount: 0,
      nextAttemptAt: 0,
      createdAt: 0,
      updatedAt: 0,
    });
  });

  await admin.mutation(api.domains.featureFlags.setFlag, {
    key: "integrations",
    enabled: false,
    reason: "Vendor incident — pausing outbound traffic",
  });
  // Nothing is claimed, so nothing is sent, and the job is not discarded.
  expect(
    await tx.mutation(internal.domains.communications.claimDueJob, {}),
  ).toBe(null);
  expect(
    await tx.run(
      async (ctx) => (await ctx.db.query("communicationJobs").first())?.status,
    ),
  ).toBe("pending");
});
