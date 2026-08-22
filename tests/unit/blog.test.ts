// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { hasCapability } from "../../convex/lib/permissions";
import { contentImageProblem } from "../../convex/lib/contentImages";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";

const modules = import.meta.glob("../../convex/**/*.ts");
const post = {
  slug: "understanding-trd",
  title: "Understanding TRD",
  category: "Mental health" as const,
  excerpt: "What it means.",
  sections: [
    { id: "body", type: "richText" as const, text: "Para one.\n\nPara two." },
  ],
  authorName: "Canyon Creek Team",
};
const postContent = {
  title: post.title,
  category: post.category,
  excerpt: post.excerpt,
  sections: post.sections,
  authorName: post.authorName,
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
  test("post creation derives a unique address, drafts empty content, and audits", async () => {
    const tx = convexTest(schema, modules);
    const staff = await seedUser(tx, ["clinicalStaff"], "blog_create");
    const postId = await staff.mutation(api.domains.blog.createPost, {
      title: "Practice Update!",
    });

    await expect(
      staff.mutation(api.domains.blog.createPost, {
        title: "Practice Update",
      }),
    ).rejects.toThrow("A post with this address already exists");

    expect(
      await staff.query(api.domains.blog.getPost, { postId }),
    ).toMatchObject({
      slug: "practice-update",
      draftContent: {
        title: "Practice Update!",
        category: "Practice news",
        excerpt: "",
        authorName: "",
        sections: [],
      },
    });
    expect(
      (await tx.run((ctx) => ctx.db.query("auditEvents").collect())).filter(
        (event) => event.action === "content.blogPost.created",
      ),
    ).toHaveLength(1);
    await expect(
      staff.mutation(api.domains.blog.createPost, { title: "!!!" }),
    ).rejects.toThrow("Title must include at least one letter or number");
  });

  test("published posts return resolved image URLs for image sections", async () => {
    const tx = convexTest(schema, modules);
    const staff = await seedUser(tx, ["clinicalStaff"], "blog_images");
    const storageId = await tx.run(async (ctx) =>
      ctx.storage.store(new Blob(["synthetic"], { type: "image/jpeg" })),
    );
    const postId = await staff.mutation(api.domains.blog.createPost, {
      title: "Image post",
    });
    await staff.mutation(api.domains.blog.savePostDraft, {
      postId,
      content: {
        ...postContent,
        sections: [
          ...post.sections,
          {
            id: "treatment-room",
            type: "image",
            storageId,
            alt: "A calm treatment room",
          },
        ],
      },
    });
    await tx.run(async (ctx) => {
      const row = await ctx.db.get(postId);
      await ctx.db.patch(postId, {
        content: row!.draftContent,
        status: "published",
        publishedAt: 1,
      });
    });

    const published = await tx.query(api.domains.blog.getPublishedPost, {
      slug: "image-post",
    });

    expect(published?.imageUrls[storageId]).toEqual(expect.any(String));
  });

  test("public queries expose only published posts with an allowlisted shape", async () => {
    const tx = convexTest(schema, modules);
    const staff = await seedUser(tx, ["clinicalStaff"], "blog_public");
    await staff.mutation(api.domains.blog.createPost, {
      title: "Draft slug",
    });
    const publishedId = await staff.mutation(api.domains.blog.createPost, {
      title: "Published slug",
    });
    await staff.mutation(api.domains.blog.savePostDraft, {
      postId: publishedId,
      content: postContent,
    });
    await staff.mutation(api.domains.blog.publishPost, { postId: publishedId });
    const archivedId = await staff.mutation(api.domains.blog.createPost, {
      title: "Archived slug",
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
      "coverImage",
      "excerpt",
      "imageUrls",
      "publishedAt",
      "sections",
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
      title: "Older post",
    });
    const newerId = await staff.mutation(api.domains.blog.createPost, {
      title: "Newer post",
    });
    await staff.mutation(api.domains.blog.savePostDraft, {
      postId: olderId,
      content: postContent,
    });
    await staff.mutation(api.domains.blog.savePostDraft, {
      postId: newerId,
      content: postContent,
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
    const id = await staff.mutation(api.domains.blog.createPost, {
      title: post.title,
    });
    await staff.mutation(api.domains.blog.savePostDraft, {
      postId: id,
      content: postContent,
    });
    await staff.mutation(api.domains.blog.savePostDraft, {
      postId: id,
      content: {
        ...postContent,
        title: "Understanding treatment-resistant depression",
      },
    });
    await staff.mutation(api.domains.blog.publishPost, { postId: id });
    expect(
      await tx.query(api.domains.blog.listPublishedPosts, {}),
    ).toHaveLength(1);
    await staff.mutation(api.domains.blog.savePostDraft, {
      postId: id,
      content: { ...postContent, title: "Unpublished title" },
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
      staff.mutation(api.domains.blog.savePostDraft, {
        postId: id,
        content: { ...postContent, title: "Nope" },
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
    const id = await first.mutation(api.domains.blog.createPost, {
      title: post.title,
    });
    await expect(
      second.mutation(api.domains.blog.savePostDraft, {
        postId: id,
        content: { ...postContent, title: "Updated by another author" },
      }),
    ).resolves.toBeNull();
  });

  test("duplicate title address is rejected", async () => {
    const tx = convexTest(schema, modules);
    const staff = await seedUser(tx, ["clinicalStaff"], "blog_duplicate");
    await staff.mutation(api.domains.blog.createPost, { title: post.title });
    await expect(
      staff.mutation(api.domains.blog.createPost, { title: post.title }),
    ).rejects.toThrow("A post with this address already exists");
  });

  test("drafts allow empty sections but publish reports every missing field", async () => {
    const tx = convexTest(schema, modules);
    const staff = await seedUser(tx, ["clinicalStaff"], "blog_partial");
    const postId = await staff.mutation(api.domains.blog.createPost, {
      title: "Partial post",
    });
    await staff.mutation(api.domains.blog.savePostDraft, {
      postId,
      content: {
        ...postContent,
        title: "",
        excerpt: "",
        sections: [],
        authorName: "",
      },
    });

    await expect(
      staff.mutation(api.domains.blog.publishPost, { postId }),
    ).rejects.toThrow(
      /Title is required[\s\S]*Excerpt is required[\s\S]*Author name is required[\s\S]*At least one section is required/,
    );
  });

  test("public queries project legacy nested blog content", async () => {
    const tx = convexTest(schema, modules);
    await seedUser(tx, ["clinicalStaff"], "blog_legacy");
    const createdByUserId = await tx.run(
      async (ctx) =>
        (await ctx.db
          .query("users")
          .withIndex("by_clerk_user_id", (q) =>
            q.eq("clerkUserId", "blog_legacy"),
          )
          .unique())!._id,
    );
    await tx.run((ctx) =>
      ctx.db.insert("blogPosts", {
        slug: "legacy-post",
        status: "published",
        content: {
          title: "Legacy post",
          category: "Practice news",
          excerpt: "Legacy excerpt",
          body: "Legacy body",
          authorName: "Canyon Creek Team",
        },
        publishedAt: 1,
        createdByUserId,
        createdAt: 1,
        updatedAt: 1,
      }),
    );

    await expect(
      tx.query(api.domains.blog.getPublishedPost, { slug: "legacy-post" }),
    ).resolves.toMatchObject({ body: "Legacy body" });
  });

  test("blog authoring is restricted to content.author", async () => {
    const tx = convexTest(schema, modules);
    const staff = await seedUser(tx, ["clinicalStaff"], "blog_author");
    const patient = await seedUser(tx, ["patient"], "blog_patient");
    const auditor = await seedUser(tx, ["auditor"], "blog_auditor");
    const postId = await staff.mutation(api.domains.blog.createPost, {
      title: post.title,
    });

    for (const actor of [patient, auditor]) {
      await expect(
        actor.mutation(api.domains.blog.createPost, { title: "Denied post" }),
      ).rejects.toThrow("Not authorized");
      await expect(
        actor.mutation(api.domains.blog.savePostDraft, {
          postId,
          content: { ...postContent, title: "Nope" },
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
      await expect(
        actor.mutation(api.domains.content.generateContentImageUploadUrl, {
          for: "blogPost",
        }),
      ).rejects.toThrow("Not authorized");
    }
  });

  test("savePostDraft requires content.author", async () => {
    const tx = convexTest(schema, modules);
    const staff = await seedUser(tx, ["clinicalStaff"], "save_post_author");
    const patient = await seedUser(tx, ["patient"], "save_post_patient");
    const postId = await staff.mutation(api.domains.blog.createPost, {
      title: "Private post",
    });

    await expect(
      patient.mutation(api.domains.blog.savePostDraft, {
        postId,
        content: postContent,
      }),
    ).rejects.toThrow("Not authorized");
  });

  test("getPost rejects unauthenticated and wrong-capability readers", async () => {
    const tx = convexTest(schema, modules);
    const staff = await seedUser(tx, ["clinicalStaff"], "get_post_author");
    const patient = await seedUser(tx, ["patient"], "get_post_patient");
    const postId = await staff.mutation(api.domains.blog.createPost, {
      title: "Private post",
    });

    await expect(
      tx.query(api.domains.blog.getPost, { postId }),
    ).rejects.toThrow("Not authenticated");
    await expect(
      patient.query(api.domains.blog.getPost, { postId }),
    ).rejects.toThrow("Not authorized");
  });

  test("cover images require authored alt text and valid stored bytes", async () => {
    const tx = convexTest(schema, modules);
    const staff = await seedUser(tx, ["clinicalStaff"], "blog_cover");
    const storageId = await tx.run(async (ctx) =>
      ctx.storage.store(new Blob(["synthetic"], { type: "image/jpeg" })),
    );
    const postId = await staff.mutation(api.domains.blog.createPost, {
      title: post.title,
    });
    await staff.mutation(api.domains.blog.savePostDraft, {
      postId,
      content: { ...postContent, coverImage: { storageId, alt: "" } },
    });
    await expect(
      staff.mutation(api.domains.blog.publishPost, { postId }),
    ).rejects.toThrow("Too small");
    await staff.mutation(api.domains.blog.savePostDraft, {
      postId,
      content: {
        ...postContent,
        coverImage: { storageId, alt: "A welcoming office" },
      },
    });
    await tx.run(async (ctx) => {
      const row = await ctx.db.get(postId);
      await ctx.db.patch(postId, {
        content: row!.draftContent,
        status: "published",
        publishedAt: 1,
      });
    });
    await expect(
      tx.query(api.domains.blog.getPublishedPost, { slug: post.slug }),
    ).resolves.toMatchObject({
      coverImage: { url: expect.any(String), alt: "A welcoming office" },
    });
  });

  test("image metadata validation rejects unsupported and oversized files", () => {
    expect(
      contentImageProblem({ contentType: "image/svg+xml", size: 1 }),
    ).toMatch(/JPEG, PNG, or WebP/);
    expect(
      contentImageProblem({
        contentType: "image/png",
        size: 5 * 1024 * 1024 + 1,
      }),
    ).toMatch(/5 MB/);
  });
});
