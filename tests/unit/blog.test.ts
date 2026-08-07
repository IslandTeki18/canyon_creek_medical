// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { hasCapability } from "../../convex/lib/permissions";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";

const modules = import.meta.glob("../../convex/**/*.ts");
const post = {
  slug: "understanding-trd",
  title: "Understanding TRD",
  category: "Mental health" as const,
  excerpt: "What it means.",
  body: "Para one.\n\nPara two.",
  authorName: "Canyon Creek Team",
};

describe("content.author capability", () => {
  test.each([
    "frontDesk",
    "clinicalStaff",
    "provider",
    "administrator",
  ] as const)("%s can author content", (role) =>
    expect(hasCapability([role], "content.author")).toBe(true),
  );
  test.each(["patient", "auditor"] as const)(
    "%s cannot author content",
    (role) => expect(hasCapability([role], "content.author")).toBe(false),
  );
});

describe("blog post lifecycle", () => {
  test("public queries expose only published posts with an allowlisted shape", async () => {
    const tx = convexTest(schema, modules);
    const staff = await seedUser(tx, ["clinicalStaff"], "blog_public");
    await staff.mutation(api.domains.blog.createPost, {
      ...post,
      slug: "draft-slug",
    });
    const publishedId = await staff.mutation(api.domains.blog.createPost, {
      ...post,
      slug: "published-slug",
    });
    await staff.mutation(api.domains.blog.publishPost, { postId: publishedId });
    const archivedId = await staff.mutation(api.domains.blog.createPost, {
      ...post,
      slug: "archived-slug",
    });
    await staff.mutation(api.domains.blog.archivePost, {
      postId: archivedId,
      reason: "outdated",
    });

    const list = await tx.query(api.domains.blog.listPublishedPosts, {});
    expect(list).toHaveLength(1);
    expect(Object.keys(list[0]).sort()).toEqual([
      "authorName",
      "body",
      "category",
      "excerpt",
      "imageUrl",
      "publishedAt",
      "slug",
      "title",
    ]);
    expect(
      await tx.query(api.domains.blog.getPublishedPost, { slug: "draft-slug" }),
    ).toBeNull();
    expect(
      await tx.query(api.domains.blog.getPublishedPost, {
        slug: "archived-slug",
      }),
    ).toBeNull();
    expect(
      await tx.query(api.domains.blog.getPublishedPost, {
        slug: "missing-slug",
      }),
    ).toBeNull();
  });

  test("published posts are sorted newest first", async () => {
    const tx = convexTest(schema, modules);
    const staff = await seedUser(tx, ["clinicalStaff"], "blog_sorting");
    const olderId = await staff.mutation(api.domains.blog.createPost, {
      ...post,
      slug: "older-post",
    });
    const newerId = await staff.mutation(api.domains.blog.createPost, {
      ...post,
      slug: "newer-post",
    });
    await staff.mutation(api.domains.blog.publishPost, { postId: olderId });
    await staff.mutation(api.domains.blog.publishPost, { postId: newerId });
    await tx.run(async (ctx) => {
      await ctx.db.patch(olderId, { publishedAt: 1 });
      await ctx.db.patch(newerId, { publishedAt: 2 });
    });

    expect(
      (await tx.query(api.domains.blog.listPublishedPosts, {})).map(
        ({ slug }) => slug,
      ),
    ).toEqual(["newer-post", "older-post"]);
  });

  test("clinicalStaff can create, edit, publish, unpublish, archive", async () => {
    const tx = convexTest(schema, modules);
    const staff = await seedUser(tx, ["clinicalStaff"], "blog_staff");
    const id = await staff.mutation(api.domains.blog.createPost, post);
    await staff.mutation(api.domains.blog.updatePost, {
      postId: id,
      title: "Understanding treatment-resistant depression",
    });
    await staff.mutation(api.domains.blog.publishPost, { postId: id });
    expect(
      await tx.query(api.domains.blog.listPublishedPosts, {}),
    ).toHaveLength(1);
    await staff.mutation(api.domains.blog.updatePost, {
      postId: id,
      title: "Unpublished title",
    });
    expect(
      await tx.query(api.domains.blog.getPublishedPost, { slug: post.slug }),
    ).toMatchObject({ title: "Understanding treatment-resistant depression" });
    expect(
      (await staff.query(api.domains.blog.getPost, { postId: id }))
        ?.draftContent,
    ).toMatchObject({ title: "Unpublished title" });
    await staff.mutation(api.domains.blog.discardPostDraft, { postId: id });
    expect(
      (await staff.query(api.domains.blog.getPost, { postId: id }))
        ?.draftContent,
    ).toBeUndefined();
    await staff.mutation(api.domains.blog.unpublishPost, { postId: id });
    expect(
      (await staff.query(api.domains.blog.getPost, { postId: id }))
        ?.publishedAt,
    ).toBeTypeOf("number");
    await expect(
      staff.mutation(api.domains.blog.updatePost, {
        postId: id,
        slug: "changed-after-publish",
      }),
    ).rejects.toThrow("Slug cannot be changed after publishing");
    await expect(
      staff.mutation(api.domains.blog.archivePost, { postId: id, reason: " " }),
    ).rejects.toThrow("Reason is required");
    await staff.mutation(api.domains.blog.archivePost, {
      postId: id,
      reason: "outdated",
    });
    await expect(
      staff.mutation(api.domains.blog.updatePost, {
        postId: id,
        title: "Nope",
      }),
    ).rejects.toThrow("Post is archived");
    await expect(
      staff.mutation(api.domains.blog.publishPost, { postId: id }),
    ).rejects.toThrow("Post is archived");
    await expect(
      staff.mutation(api.domains.blog.unpublishPost, { postId: id }),
    ).rejects.toThrow("Post is archived");
    await expect(
      staff.mutation(api.domains.blog.archivePost, {
        postId: id,
        reason: "outdated",
      }),
    ).rejects.toThrow("Post is archived");
  });

  test("a staff author can edit another author's post", async () => {
    const tx = convexTest(schema, modules);
    const first = await seedUser(tx, ["clinicalStaff"], "blog_first");
    const second = await seedUser(tx, ["clinicalStaff"], "blog_second");
    const id = await first.mutation(api.domains.blog.createPost, post);
    await expect(
      second.mutation(api.domains.blog.updatePost, {
        postId: id,
        title: "Updated by another author",
      }),
    ).resolves.toBeNull();
  });

  test("duplicate slug is rejected", async () => {
    const tx = convexTest(schema, modules);
    const staff = await seedUser(tx, ["clinicalStaff"], "blog_duplicate");
    await staff.mutation(api.domains.blog.createPost, post);
    await expect(
      staff.mutation(api.domains.blog.createPost, post),
    ).rejects.toThrow("Slug already exists");
  });

  test("invalid slug format is rejected", async () => {
    const tx = convexTest(schema, modules);
    const staff = await seedUser(tx, ["clinicalStaff"], "blog_slug");
    await expect(
      staff.mutation(api.domains.blog.createPost, {
        ...post,
        slug: "Has Spaces!",
      }),
    ).rejects.toThrow("Invalid slug");
  });

  test("blog authoring is restricted to content.author", async () => {
    const tx = convexTest(schema, modules);
    const staff = await seedUser(tx, ["clinicalStaff"], "blog_author");
    const patient = await seedUser(tx, ["patient"], "blog_patient");
    const auditor = await seedUser(tx, ["auditor"], "blog_auditor");
    const postId = await staff.mutation(api.domains.blog.createPost, post);

    for (const actor of [patient, auditor]) {
      await expect(
        actor.mutation(api.domains.blog.createPost, post),
      ).rejects.toThrow("Not authorized");
      await expect(
        actor.mutation(api.domains.blog.updatePost, {
          postId,
          title: "Nope",
        }),
      ).rejects.toThrow("Not authorized");
      await expect(
        actor.mutation(api.domains.blog.publishPost, { postId }),
      ).rejects.toThrow("Not authorized");
      await expect(
        actor.mutation(api.domains.blog.unpublishPost, { postId }),
      ).rejects.toThrow("Not authorized");
      await expect(
        actor.mutation(api.domains.blog.discardPostDraft, { postId }),
      ).rejects.toThrow("Not authorized");
      await expect(
        actor.mutation(api.domains.blog.archivePost, {
          postId,
          reason: "Nope",
        }),
      ).rejects.toThrow("Not authorized");
      await expect(actor.query(api.domains.blog.listPosts, {})).rejects.toThrow(
        "Not authorized",
      );
      await expect(
        actor.query(api.domains.blog.getPost, { postId }),
      ).rejects.toThrow("Not authorized");
    }
  });
});
