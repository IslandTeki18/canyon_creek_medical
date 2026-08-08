// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";

const modules = import.meta.glob("../../convex/**/*.ts");

async function users(tx: ReturnType<typeof convexTest>, name: string) {
  const administrator = await seedUser(tx, ["administrator"], `${name}_admin`);
  const patient = await seedUser(tx, ["patient"], `${name}_patient`);
  const createdByUserId = await tx.run(async (ctx) =>
    (await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", `${name}_admin`))
      .unique())!._id,
  );
  return { administrator, patient, createdByUserId };
}

test("restores an archived service page with authorization", async () => {
  const tx = convexTest(schema, modules);
  const { administrator, patient, createdByUserId } = await users(tx, "service");
  const servicePageId = await tx.run((ctx) =>
    ctx.db.insert("servicePages", {
      slug: "archived-service",
      status: "archived",
      sortOrder: 1,
      draftContent: {},
      archivedAt: 1,
      archiveReason: "Outdated",
      createdByUserId,
      createdAt: 1,
      updatedAt: 1,
    }),
  );

  await expect(
    patient.mutation(api.domains.content.restoreServicePage, { servicePageId }),
  ).rejects.toThrow("Not authorized");
  await administrator.mutation(api.domains.content.restoreServicePage, {
    servicePageId,
  });

  await expect(
    tx.run((ctx) => ctx.db.get(servicePageId)),
  ).resolves.toMatchObject({
    status: "draft",
    archivedAt: undefined,
    archiveReason: undefined,
  });
});

test("restores an archived blog post with authorization", async () => {
  const tx = convexTest(schema, modules);
  const { administrator, patient, createdByUserId } = await users(tx, "blog");
  const postId = await tx.run((ctx) =>
    ctx.db.insert("blogPosts", {
      slug: "archived-post",
      status: "archived",
      draftContent: {},
      archivedAt: 1,
      archiveReason: "Outdated",
      createdByUserId,
      createdAt: 1,
      updatedAt: 1,
    }),
  );

  await expect(
    patient.mutation(api.domains.blog.restorePost, { postId }),
  ).rejects.toThrow("Not authorized");
  await administrator.mutation(api.domains.blog.restorePost, { postId });

  await expect(tx.run((ctx) => ctx.db.get(postId))).resolves.toMatchObject({
    status: "draft",
    archivedAt: undefined,
    archiveReason: undefined,
  });
});
