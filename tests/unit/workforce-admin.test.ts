// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

async function seedAdmin(tx: ReturnType<typeof convexTest>) {
  await tx.run(async (ctx) => {
    await ctx.db.insert("users", {
      clerkUserId: "user_admin",
      type: "workforce",
      status: "active",
      roles: ["administrator"],
      displayName: "Synthetic Admin",
      createdAt: 0,
      updatedAt: 0,
    });
  });
  return tx.withIdentity({ subject: "user_admin" });
}

test("invitation creates a pending record and audit event", async () => {
  const tx = convexTest(schema, modules);
  const admin = await seedAdmin(tx);
  await admin.mutation(api.domains.workforce.inviteWorkforceUser, {
    email: "New.Staff@Example.com",
    roles: ["frontDesk"],
  });
  const { invitations, audits } = await tx.run(async (ctx) => ({
    invitations: await ctx.db.query("workforceInvitations").collect(),
    audits: await ctx.db.query("auditEvents").collect(),
  }));
  expect(invitations).toHaveLength(1);
  expect(invitations[0].email).toBe("new.staff@example.com");
  expect(invitations[0].status).toBe("pending");
  expect(audits.some((a) => a.action === "workforce.invitation.created")).toBe(
    true,
  );
});

test("invitation rejects patient role and duplicate pending invites", async () => {
  const tx = convexTest(schema, modules);
  const admin = await seedAdmin(tx);
  await expect(
    admin.mutation(api.domains.workforce.inviteWorkforceUser, {
      email: "a@example.com",
      roles: ["patient"],
    }),
  ).rejects.toThrow("workforce roles");
  await admin.mutation(api.domains.workforce.inviteWorkforceUser, {
    email: "a@example.com",
    roles: ["provider"],
  });
  await expect(
    admin.mutation(api.domains.workforce.inviteWorkforceUser, {
      email: "a@example.com",
      roles: ["provider"],
    }),
  ).rejects.toThrow("already pending");
});

test("non-admin roles cannot invite", async () => {
  const tx = convexTest(schema, modules);
  await tx.run(async (ctx) => {
    await ctx.db.insert("users", {
      clerkUserId: "user_fd",
      type: "workforce",
      status: "active",
      roles: ["frontDesk"],
      displayName: "Synthetic Front Desk",
      createdAt: 0,
      updatedAt: 0,
    });
  });
  await expect(
    tx
      .withIdentity({ subject: "user_fd" })
      .mutation(api.domains.workforce.inviteWorkforceUser, {
        email: "x@example.com",
        roles: ["frontDesk"],
      }),
  ).rejects.toThrow("Not authorized");
});

test("accepting an invitation applies approved roles before first access", async () => {
  const tx = convexTest(schema, modules);
  const admin = await seedAdmin(tx);
  await admin.mutation(api.domains.workforce.inviteWorkforceUser, {
    email: "clinician@example.com",
    roles: ["provider"],
  });
  // Simulates the Clerk user.created webhook after invitation acceptance.
  await tx.mutation(internal.domains.users.upsertFromClerk, {
    clerkUserId: "user_new_provider",
    type: "workforce",
    displayName: "Synthetic Provider",
    email: "Clinician@example.com",
  });
  const { user, invitation } = await tx.run(async (ctx) => ({
    user: await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) =>
        q.eq("clerkUserId", "user_new_provider"),
      )
      .unique(),
    invitation: (await ctx.db.query("workforceInvitations").collect())[0],
  }));
  expect(user?.roles).toEqual(["provider"]);
  expect(invitation.status).toBe("accepted");
});

test("status change requires a reason, writes audit, and takes effect immediately", async () => {
  const tx = convexTest(schema, modules);
  const admin = await seedAdmin(tx);
  const targetId = await tx.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "user_target",
      type: "workforce",
      status: "active",
      roles: ["administrator"],
      displayName: "Synthetic Target",
      createdAt: 0,
      updatedAt: 0,
    }),
  );
  await expect(
    admin.mutation(api.domains.workforce.setWorkforceUserStatus, {
      userId: targetId,
      status: "suspended",
      reason: "  ",
    }),
  ).rejects.toThrow("reason is required");
  await admin.mutation(api.domains.workforce.setWorkforceUserStatus, {
    userId: targetId,
    status: "suspended",
    reason: "Policy violation review",
  });
  // The suspended admin is denied immediately, even with a live session.
  await expect(
    tx
      .withIdentity({ subject: "user_target" })
      .query(api.domains.workforce.listWorkforceUsers, {}),
  ).rejects.toThrow("Account is not active");
  const audits = await tx.run((ctx) => ctx.db.query("auditEvents").collect());
  expect(audits.some((a) => a.action === "workforce.user.suspended")).toBe(
    true,
  );
});

test("role change requires reason and is audited; self-status change is blocked", async () => {
  const tx = convexTest(schema, modules);
  const admin = await seedAdmin(tx);
  const targetId = await tx.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "user_target2",
      type: "workforce",
      status: "active",
      roles: ["frontDesk"],
      displayName: "Synthetic Target",
      createdAt: 0,
      updatedAt: 0,
    }),
  );
  await expect(
    admin.mutation(api.domains.workforce.setWorkforceUserRoles, {
      userId: targetId,
      roles: ["clinicalStaff"],
      reason: "",
    }),
  ).rejects.toThrow("reason is required");
  await admin.mutation(api.domains.workforce.setWorkforceUserRoles, {
    userId: targetId,
    roles: ["clinicalStaff"],
    reason: "Position change",
  });
  const target = await tx.run((ctx) => ctx.db.get(targetId));
  expect(target?.roles).toEqual(["clinicalStaff"]);

  const adminId = await tx.run(async (ctx) => {
    const u = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", "user_admin"))
      .unique();
    return u!._id;
  });
  await expect(
    admin.mutation(api.domains.workforce.setWorkforceUserStatus, {
      userId: adminId,
      status: "deactivated",
      reason: "oops",
    }),
  ).rejects.toThrow("your own status");
});

test("revoking an invitation requires a reason and is audited", async () => {
  const tx = convexTest(schema, modules);
  const admin = await seedAdmin(tx);
  const invitationId = await admin.mutation(
    api.domains.workforce.inviteWorkforceUser,
    { email: "r@example.com", roles: ["auditor"] },
  );
  await expect(
    admin.mutation(api.domains.workforce.revokeInvitation, {
      invitationId,
      reason: "",
    }),
  ).rejects.toThrow("reason is required");
  await admin.mutation(api.domains.workforce.revokeInvitation, {
    invitationId,
    reason: "Sent to wrong address",
  });
  const invitation = await tx.run((ctx) => ctx.db.get(invitationId));
  expect(invitation?.status).toBe("revoked");
});
