import type { convexTest } from "convex-test";
import type { Role } from "../../convex/lib/permissions";

export async function seedUser(
  tx: ReturnType<typeof convexTest>,
  roles: Role[],
  clerkUserId: string,
  email?: string,
) {
  await tx.run(async (ctx) => {
    await ctx.db.insert("users", {
      clerkUserId,
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
