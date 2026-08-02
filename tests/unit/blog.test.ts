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
  test("clinicalStaff can create, edit, publish, unpublish, archive", async () => {
    const tx = convexTest(schema, modules);
    const staff = await seedUser(tx, ["clinicalStaff"], "blog_staff");
    const id = await staff.mutation(api.domains.blog.createPost, post);
    await staff.mutation(api.domains.blog.updatePost, {
      postId: id,
      title: "Understanding treatment-resistant depression",
    });
    await staff.mutation(api.domains.blog.publishPost, { postId: id });
    expect(await tx.query(api.domains.blog.listPublishedPosts, {})).toHaveLength(
      1,
    );
    await staff.mutation(api.domains.blog.unpublishPost, { postId: id });
    await staff.mutation(api.domains.blog.archivePost, {
      postId: id,
      reason: "outdated",
    });
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
      staff.mutation(api.domains.blog.createPost, { ...post, slug: "Has Spaces!" }),
    ).rejects.toThrow("Invalid slug");
  });

  test("blog authoring is restricted to content.author", async () => {
    const tx = convexTest(schema, modules);
    const patient = await seedUser(tx, ["patient"], "blog_patient");
    const auditor = await seedUser(tx, ["auditor"], "blog_auditor");
    await expect(
      patient.mutation(api.domains.blog.createPost, post),
    ).rejects.toThrow("Not authorized");
    await expect(
      auditor.mutation(api.domains.blog.createPost, post),
    ).rejects.toThrow("Not authorized");
    await expect(patient.query(api.domains.blog.listPosts, {})).rejects.toThrow(
      "Not authorized",
    );
  });
});
