// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
import {
  blogPostContentSchema,
  parseServicePageContent,
  type ServicePageContent,
} from "../../convex/lib/content";
import {
  migrateBlogContent,
  migrateServiceContent,
} from "../../convex/migrations/sectionContent";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";

const modules = import.meta.glob("../../convex/**/*.ts");
const legacyBlog = {
  title: "Practice update",
  category: "Practice news",
  excerpt: "Synthetic excerpt",
  authorName: "Canyon Creek Team",
  body: "Synthetic body",
};

function toLegacyService(content: ServicePageContent) {
  const [richText, itemGrid, numberedSteps] = content.sections;
  if (
    richText?.type !== "richText" ||
    itemGrid?.type !== "itemGrid" ||
    numberedSteps?.type !== "numberedSteps"
  ) {
    throw new Error("Unexpected seeded section order");
  }
  const { sections: _, ...rest } = content;
  return {
    ...rest,
    howItWorks: richText.text.split("\n\n"),
    indications: itemGrid.items,
    steps: numberedSteps.steps,
  };
}

test("converts all six seeded service shapes into strict content", async () => {
  const tx = convexTest(schema, modules);
  await seedUser(tx, ["administrator"], "migration_seed_admin");
  await tx.mutation(internal.domains.contentSeed.seedServicePages, {});
  const pages = await tx.run((ctx) => ctx.db.query("servicePages").collect());

  expect(pages).toHaveLength(6);
  for (const page of pages) {
    const migrated = migrateServiceContent(
      toLegacyService(page.content as ServicePageContent),
      page.slug,
    );
    expect(() => parseServicePageContent(migrated)).not.toThrow();
  }
});

test("converts legacy blog content into strict content", () => {
  expect(() =>
    blogPostContentSchema.parse(migrateBlogContent(legacyBlog, "post")),
  ).not.toThrow();
});

test("pure converters ignore already migrated content", () => {
  expect(migrateServiceContent({ sections: [] }, "service")).toBeUndefined();
  expect(migrateBlogContent({ sections: [] }, "post")).toBeUndefined();
});

test("migration is idempotent and produces strict content", async () => {
  const tx = convexTest(schema, modules);
  await seedUser(tx, ["administrator"], "migration_admin");
  const createdByUserId = await tx.run(
    async (ctx) =>
      (await ctx.db
        .query("users")
        .withIndex("by_clerk_user_id", (q) =>
          q.eq("clerkUserId", "migration_admin"),
        )
        .unique())!._id,
  );
  const legacyService = {
    title: "Legacy service",
    icon: "brain",
    summary: "Synthetic summary",
    chips: [],
    tags: [],
    intro: "Synthetic introduction",
    howItWorks: ["Synthetic explanation"],
    indications: ["Synthetic indication"],
    steps: [{ title: "Step", body: "Synthetic body" }],
    facts: [],
    safetyNote: "Synthetic safety note",
  };
  await tx.run(async (ctx) => {
    await ctx.db.insert("servicePages", {
      slug: "legacy-service",
      sortOrder: 0,
      status: "published",
      content: legacyService,
      createdByUserId,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("blogPosts", {
      slug: "legacy-post",
      status: "published",
      content: legacyBlog,
      createdByUserId,
      createdAt: 1,
      updatedAt: 1,
    });
  });

  expect(
    await tx.mutation(internal.migrations.sectionContent.migrate, {}),
  ).toEqual({ servicePages: 1, blogPosts: 1 });
  expect(
    await tx.mutation(internal.migrations.sectionContent.migrate, {}),
  ).toEqual({ servicePages: 0, blogPosts: 0 });

  const [servicePage, post] = await tx.run(async (ctx) => [
    await ctx.db.query("servicePages").unique(),
    await ctx.db.query("blogPosts").unique(),
  ]);
  expect(() => parseServicePageContent(servicePage!.content)).not.toThrow();
  expect(() => blogPostContentSchema.parse(post!.content)).not.toThrow();
});
