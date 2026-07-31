// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { severityForAction } from "../../convex/lib/audit";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedPatients } from "../fixtures/patients";

const modules = import.meta.glob("../../convex/**/*.ts");

test("severity is derived from the action family", () => {
  expect(severityForAction("report.exported")).toBe("high");
  expect(severityForAction("workforce.user.roles_changed")).toBe("high");
  expect(severityForAction("ketamine.session.ready_override")).toBe("high");
  expect(severityForAction("security.webhook_signature_failed")).toBe("high");
  expect(severityForAction("feature_flag.enabled")).toBe("notice");
  expect(severityForAction("patient.chart.viewed")).toBe("info");
});

test("an auditor reconstructs a change and export sequence", async () => {
  const tx = convexTest(schema, modules);
  const admin = await seedUser(tx, ["administrator"], "aud_admin");
  const auditor = await seedUser(tx, ["auditor"], "aud_auditor");
  const [patientId] = await seedPatients(tx);

  // A configuration change, then an export — the sequence to reconstruct.
  await admin.mutation(api.domains.featureFlags.setFlag, {
    key: "secureMessaging",
    enabled: true,
    reason: "Policy approved",
  });
  await admin.mutation(api.domains.reporting.exportReport, {
    report: "appointmentOutcomes",
    from: "2026-08-01",
    to: "2026-08-31",
    reason: "Monthly operations review",
  });

  const high = await auditor.query(api.domains.audit.listHighPriority, {});
  expect(high.map((event) => event.action)).toEqual(["report.exported"]);
  expect(high[0]?.actorName).toBe("Synthetic aud_admin");
  expect(high[0]?.reason).toContain("scope=2026-08-01..2026-08-31");

  const flagEvents = await auditor.query(api.domains.audit.listEvents, {
    action: "feature_flag.",
  });
  expect(flagEvents).toHaveLength(1);
  expect(flagEvents[0]?.severity).toBe("notice");

  // Reconstruction by entity, oldest first.
  const history = await auditor.query(api.domains.audit.entityHistory, {
    entityType: "featureFlags",
    entityId: "secureMessaging",
  });
  expect(history.map((event) => event.action)).toEqual([
    "feature_flag.enabled",
  ]);

  // The auditor sees operational metadata only — never clinical content.
  const all = await auditor.query(api.domains.audit.listEvents, {});
  expect(JSON.stringify(all)).not.toMatch(/Testerson|dateOfBirth/);
  expect(patientId).toBeDefined();
});

test("filters compose by actor, entity, severity, and time", async () => {
  const tx = convexTest(schema, modules);
  const admin = await seedUser(tx, ["administrator"], "aud_admin_2");
  const auditor = await seedUser(tx, ["auditor"], "aud_auditor_2");
  const other = await seedUser(tx, ["administrator"], "aud_admin_3");
  await admin.mutation(api.domains.featureFlags.setFlag, {
    key: "billing",
    enabled: false,
    reason: "Confirming default",
  });
  await other.mutation(api.domains.featureFlags.setFlag, {
    key: "peptides",
    enabled: false,
    reason: "Confirming default",
  });

  const adminUserId = await tx.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", "aud_admin_2"))
      .unique();
    return user!._id;
  });
  const byActor = await auditor.query(api.domains.audit.listEvents, {
    actorUserId: adminUserId,
  });
  expect(byActor).toHaveLength(1);
  expect(byActor[0]?.entityId).toBe("billing");

  expect(
    await auditor.query(api.domains.audit.listEvents, { severity: "high" }),
  ).toEqual([]);
  expect(
    (await auditor.query(api.domains.audit.listEvents, { severity: "notice" }))
      .length,
  ).toBe(2);
  // A window that predates the events returns nothing.
  expect(
    await auditor.query(api.domains.audit.listEvents, { to: 1_000 }),
  ).toEqual([]);
});

test("audit review is restricted and the trail has no write path", async () => {
  const tx = convexTest(schema, modules);
  const provider = await seedUser(tx, ["provider"], "aud_provider");
  await expect(
    provider.query(api.domains.audit.listEvents, {}),
  ).rejects.toThrow("Not authorized");
  await expect(
    provider.query(api.domains.audit.listHighPriority, {}),
  ).rejects.toThrow("Not authorized");
  // No public mutation exists on the audit module: writing is internal only.
  expect(
    Object.keys(api.domains.audit).filter((name) =>
      name.toLowerCase().includes("record"),
    ),
  ).toEqual([]);
});

test("a failed webhook signature is recorded as a high-priority event", async () => {
  const tx = convexTest(schema, modules);
  const auditor = await seedUser(tx, ["auditor"], "aud_auditor_3");
  await tx.mutation(internal.domains.audit.recordSecurityEvent, {
    action: "webhook_signature_failed",
    entityType: "webhook",
    entityId: "twilio",
    correlationId: "synthetic-correlation",
  });
  const high = await auditor.query(api.domains.audit.listHighPriority, {});
  expect(high).toHaveLength(1);
  expect(high[0]?.action).toBe("security.webhook_signature_failed");
  expect(high[0]?.correlationId).toBe("synthetic-correlation");
  // No actor: the caller was never authenticated.
  expect(high[0]?.actorName).toBe("(system)");
});
