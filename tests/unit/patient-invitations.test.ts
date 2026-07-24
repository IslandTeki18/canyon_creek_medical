// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Role } from "../../convex/lib/permissions";
import schema from "../../convex/schema";
import { seedPatients } from "../fixtures/patients";

const modules = import.meta.glob("../../convex/**/*.ts");

async function seedUser(
  tx: ReturnType<typeof convexTest>,
  roles: Role[],
  clerkUserId: string,
  email?: string,
) {
  await tx.run(async (ctx) => {
    await ctx.db.insert("users", {
      clerkUserId,
      type: roles.includes("patient") ? "patient" : "workforce",
      status: "active",
      roles,
      displayName: `Synthetic ${clerkUserId}`,
      email,
      createdAt: 0,
      updatedAt: 0,
    });
  });
  return tx.withIdentity({ subject: clerkUserId });
}

// Avery Testerson (first seeded patient) has avery.testerson@example.com.
const AVERY_EMAIL = "avery.testerson@example.com";

test("invitation is created by staff and consumed exactly once", async () => {
  const tx = convexTest(schema, modules);
  const [patientId] = await seedPatients(tx);
  const staff = await seedUser(tx, ["frontDesk"], "user_fd");
  const patient = await seedUser(tx, ["patient"], "user_pt", AVERY_EMAIL);

  const { token } = await staff.mutation(
    api.domains.patientInvitations.createInvitation,
    { patientId },
  );
  expect(token).toMatch(/^[0-9a-f]{64}$/);

  // Raw token is never stored.
  const stored = await tx.run((ctx) =>
    ctx.db.query("patientInvitations").collect(),
  );
  expect(stored[0].tokenHash).not.toBe(token);

  const first = await patient.mutation(
    api.domains.patientInvitations.acceptInvitation,
    { token },
  );
  expect(first.status).toBe("accepted");

  // Second consumption fails, even by another matching user.
  const again = await patient.mutation(
    api.domains.patientInvitations.acceptInvitation,
    { token },
  );
  expect(again.status).toBe("consumed");

  const links = await tx.run((ctx) =>
    ctx.db.query("patientAccountLinks").collect(),
  );
  expect(links).toHaveLength(1);
  expect(links[0].patientId).toBe(patientId);

  const audits = await tx.run((ctx) => ctx.db.query("auditEvents").collect());
  for (const action of [
    "patient.invitation.created",
    "patient.invitation.accepted",
    "patient.invitation.acceptance_failed",
  ]) {
    expect(audits.some((a) => a.action === action)).toBe(true);
  }
});

test("expired, revoked, and mismatched invitations give no access", async () => {
  const tx = convexTest(schema, modules);
  const [patientId] = await seedPatients(tx);
  const staff = await seedUser(tx, ["frontDesk"], "user_fd");
  const wrongUser = await seedUser(
    tx,
    ["patient"],
    "user_wrong",
    "other@example.com",
  );
  const rightUser = await seedUser(tx, ["patient"], "user_right", AVERY_EMAIL);

  const { invitationId, token } = await staff.mutation(
    api.domains.patientInvitations.createInvitation,
    { patientId },
  );

  // Wrong identity email → mismatch.
  const mismatch = await wrongUser.mutation(
    api.domains.patientInvitations.acceptInvitation,
    { token },
  );
  expect(mismatch.status).toBe("mismatch");

  // Expired → no access.
  await tx.run((ctx) => ctx.db.patch(invitationId, { expiresAt: 1 }));
  const expired = await rightUser.mutation(
    api.domains.patientInvitations.acceptInvitation,
    { token },
  );
  expect(expired.status).toBe("expired");

  // Un-expire, revoke → no access.
  await tx.run((ctx) =>
    ctx.db.patch(invitationId, { expiresAt: Date.now() + 10_000 }),
  );
  await staff.mutation(api.domains.patientInvitations.revokeInvitation, {
    invitationId,
    reason: "Sent in error",
  });
  const revoked = await rightUser.mutation(
    api.domains.patientInvitations.acceptInvitation,
    { token },
  );
  expect(revoked.status).toBe("revoked");

  // Garbage token → invalid.
  const invalid = await rightUser.mutation(
    api.domains.patientInvitations.acceptInvitation,
    { token: "not-a-token" },
  );
  expect(invalid.status).toBe("invalid");

  expect(
    await tx.run((ctx) => ctx.db.query("patientAccountLinks").collect()),
  ).toHaveLength(0);
});

test("only staff with patient.manage can create or revoke invitations", async () => {
  const tx = convexTest(schema, modules);
  const [patientId] = await seedPatients(tx);
  for (const role of ["patient", "auditor"] as const) {
    const user = await seedUser(tx, [role], `user_${role}`);
    await expect(
      user.mutation(api.domains.patientInvitations.createInvitation, {
        patientId,
      }),
    ).rejects.toThrow("Not authorized");
  }
});

test("no duplicate pending invitation; none for linked patients", async () => {
  const tx = convexTest(schema, modules);
  const [patientId] = await seedPatients(tx);
  const staff = await seedUser(tx, ["frontDesk"], "user_fd");
  const patient = await seedUser(tx, ["patient"], "user_pt", AVERY_EMAIL);

  const { token } = await staff.mutation(
    api.domains.patientInvitations.createInvitation,
    { patientId },
  );
  await expect(
    staff.mutation(api.domains.patientInvitations.createInvitation, {
      patientId,
    }),
  ).rejects.toThrow("already pending");

  await patient.mutation(api.domains.patientInvitations.acceptInvitation, {
    token,
  });
  await expect(
    staff.mutation(api.domains.patientInvitations.createInvitation, {
      patientId,
    }),
  ).rejects.toThrow("already has a linked account");
});
