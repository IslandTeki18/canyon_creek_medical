import { ConvexError, v } from "convex/values";
import { z } from "zod";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { requireCapability } from "../lib/access";
import { writeAudit } from "../lib/audit";
import {
  blogPostContentSchema,
  blogPostDraftSchema,
  slugify,
  type BlogPostContent,
} from "../lib/content";
import {
  collectImageIds,
  contentImageProblem,
  releaseImages,
} from "../lib/contentImages";

const slugSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]+$/, "Invalid slug");
const requiredText = (label: string) =>
  z.string().trim().min(1, `${label} is required`);
const contentSchema = blogPostContentSchema;
const draftSchema = blogPostDraftSchema;
function parsePost<T extends z.ZodType>(
  schema: T,
  value: unknown,
  publish = false,
): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    if (publish) {
      throw new ConvexError({ code: "PUBLISH_VALIDATION_FAILED", issues });
    }
    throw new Error(
      `Invalid post:\n${issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("\n")}`,
    );
  }
  return result.data;
}

async function imageUrl(ctx: QueryCtx, storageId?: string) {
  return storageId
    ? await ctx.storage.getUrl(storageId as Id<"_storage">)
    : null;
}

async function sectionImageUrls(
  ctx: QueryCtx,
  ...contents: (BlogPostContent | undefined)[]
): Promise<Record<string, string>> {
  const storageIds = [...new Set(contents.flatMap(collectImageIds))];
  const entries = await Promise.all(
    storageIds.map(async (storageId) => {
      const url = await ctx.storage.getUrl(storageId as Id<"_storage">);
      return url ? ([storageId, url] as const) : null;
    }),
  );
  return Object.fromEntries(entries.filter((entry) => entry !== null));
}

async function toPublicPost(ctx: QueryCtx, doc: Doc<"blogPosts">) {
  if (!doc.content) throw new Error("Published blog post has no content");
  const { title, category, excerpt, authorName, coverImage, sections, body } =
    doc.content as Omit<BlogPostContent, "sections"> & {
      sections?: BlogPostContent["sections"];
      body?: string;
    };
  return {
    slug: doc.slug,
    title,
    category,
    excerpt,
    authorName,
    sections,
    body:
      body ??
      (sections ?? [])
        .filter((section) => section.type === "richText")
        .map((section) => section.text)
        .join("\n\n"),
    publishedAt: doc.publishedAt,
    coverImage: coverImage
      ? { url: await imageUrl(ctx, coverImage.storageId), alt: coverImage.alt }
      : null,
    imageUrls: await sectionImageUrls(ctx, doc.content),
  };
}

async function imageIssues(ctx: QueryCtx, content: BlogPostContent) {
  const entries = [
    ...(content.coverImage
      ? [["coverImage", content.coverImage.storageId] as const]
      : []),
    ...content.sections.flatMap((section, index) =>
      section.type === "image"
        ? [[`sections.${index}`, section.storageId] as const]
        : [],
    ),
  ];
  const issues = (
    await Promise.all(
      entries.map(async ([path, storageId]) => {
        const message = contentImageProblem(
          await ctx.db.system.get(storageId as Id<"_storage">),
        );
        return message ? { path, message } : null;
      }),
    )
  ).filter((issue) => issue !== null);
  if (issues.length) {
    throw new ConvexError({ code: "PUBLISH_VALIDATION_FAILED", issues });
  }
}

export const createPost = mutation({
  args: { title: v.string() },
  handler: async (ctx, { title }) => {
    const actor = await requireCapability(ctx, "content.author");
    const slug = slugify(title);
    if (!slug)
      throw new Error("Title must include at least one letter or number");
    const content = parsePost(draftSchema, {
      title,
      category: "Practice news",
      excerpt: "",
      authorName: "",
      sections: [],
    });
    const existing = await ctx.db
      .query("blogPosts")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) throw new Error("A post with this address already exists");

    const now = Date.now();
    const postId = await ctx.db.insert("blogPosts", {
      slug,
      draftContent: content,
      status: "draft",
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "content.blogPost.created",
      entityType: "blogPosts",
      entityId: postId,
    });
    return postId;
  },
});

export const updatePost = mutation({
  args: {
    postId: v.id("blogPosts"),
    slug: v.string(),
  },
  handler: async (ctx, { postId, slug: rawSlug }) => {
    const actor = await requireCapability(ctx, "content.author");
    const current = await ctx.db.get(postId);
    if (!current) throw new Error("Post not found");
    if (current.status === "archived") throw new Error("Post is archived");
    const slug = parsePost(slugSchema, rawSlug);
    if (slug && slug !== current.slug && current.publishedAt !== undefined) {
      throw new Error("Slug cannot be changed after publishing");
    }
    if (slug && slug !== current.slug) {
      const existing = await ctx.db
        .query("blogPosts")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      if (existing) throw new Error("Slug already exists");
    }
    await ctx.db.patch(postId, {
      slug,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "content.blogPost.updated",
      entityType: "blogPosts",
      entityId: postId,
    });
  },
});

export const savePostDraft = mutation({
  args: { postId: v.id("blogPosts"), content: v.any() },
  handler: async (ctx, { postId, content: rawContent }) => {
    const actor = await requireCapability(ctx, "content.author");
    const post = await ctx.db.get(postId);
    if (!post) throw new Error("Post not found");
    if (post.status === "archived") throw new Error("Post is archived");
    const content = parsePost(draftSchema, rawContent);
    const before = collectImageIds(post.draftContent);
    await ctx.db.patch(postId, {
      draftContent: content,
      draftUpdatedAt: Date.now(),
      draftUpdatedByUserId: actor._id,
    });
    if (!post.content)
      await releaseImages(ctx, before, collectImageIds(content));
  },
});

export const publishPost = mutation({
  args: { postId: v.id("blogPosts") },
  handler: async (ctx, { postId }) => {
    const actor = await requireCapability(ctx, "content.author");
    const post = await ctx.db.get(postId);
    if (!post) throw new Error("Post not found");
    if (post.status === "archived") throw new Error("Post is archived");
    const content = parsePost(
      contentSchema,
      post.draftContent ?? post.content,
      true,
    );
    await imageIssues(ctx, content);
    const before = collectImageIds(post.content);
    const now = Date.now();
    await ctx.db.patch(postId, {
      content,
      draftContent: undefined,
      draftUpdatedAt: undefined,
      draftUpdatedByUserId: undefined,
      status: "published",
      publishedAt: now,
      updatedAt: now,
    });
    await releaseImages(ctx, before, collectImageIds(content));
    await writeAudit(ctx, {
      actor,
      action: "content.blogPost.published",
      entityType: "blogPosts",
      entityId: postId,
    });
  },
});

export const discardPostDraft = mutation({
  args: { postId: v.id("blogPosts") },
  handler: async (ctx, { postId }) => {
    const actor = await requireCapability(ctx, "content.author");
    const post = await ctx.db.get(postId);
    if (!post) throw new Error("Post not found");
    if (post.status === "archived") throw new Error("Post is archived");
    if (!post.draftContent) throw new Error("Post has no draft");
    await ctx.db.patch(postId, {
      draftContent: undefined,
      draftUpdatedAt: undefined,
      draftUpdatedByUserId: undefined,
      updatedAt: Date.now(),
    });
    await releaseImages(
      ctx,
      collectImageIds(post.draftContent),
      collectImageIds(post.content),
    );
    await writeAudit(ctx, {
      actor,
      action: "content.blogPost.draftDiscarded",
      entityType: "blogPosts",
      entityId: postId,
    });
  },
});

export const unpublishPost = mutation({
  args: { postId: v.id("blogPosts") },
  handler: async (ctx, { postId }) => {
    const actor = await requireCapability(ctx, "content.author");
    const post = await ctx.db.get(postId);
    if (!post) throw new Error("Post not found");
    if (post.status === "archived") throw new Error("Post is archived");
    await ctx.db.patch(postId, {
      status: "draft",
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "content.blogPost.unpublished",
      entityType: "blogPosts",
      entityId: postId,
    });
  },
});

export const archivePost = mutation({
  args: { postId: v.id("blogPosts"), reason: v.string() },
  handler: async (ctx, { postId, reason: rawReason }) => {
    const actor = await requireCapability(ctx, "content.author");
    const post = await ctx.db.get(postId);
    if (!post) throw new Error("Post not found");
    if (post.status === "archived") throw new Error("Post is archived");
    const reason = parsePost(requiredText("Reason"), rawReason);
    const now = Date.now();
    await ctx.db.patch(postId, {
      status: "archived",
      archivedAt: now,
      archiveReason: reason,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "content.blogPost.archived",
      entityType: "blogPosts",
      entityId: postId,
      reason,
    });
  },
});

export const restorePost = mutation({
  args: { postId: v.id("blogPosts") },
  handler: async (ctx, { postId }) => {
    const actor = await requireCapability(ctx, "content.author");
    const post = await ctx.db.get(postId);
    if (!post) throw new Error("Post not found");
    if (post.status !== "archived") throw new Error("Post is not archived");
    await ctx.db.patch(postId, {
      status: post.content ? "published" : "draft",
      archivedAt: undefined,
      archiveReason: undefined,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "content.blogPost.restored",
      entityType: "blogPosts",
      entityId: postId,
    });
  },
});

export const deletePost = mutation({
  args: { postId: v.id("blogPosts"), reason: v.string() },
  handler: async (ctx, { postId, reason: rawReason }) => {
    const actor = await requireCapability(ctx, "content.author");
    const post = await ctx.db.get(postId);
    if (!post) throw new Error("Post not found");
    if (post.status !== "archived") throw new Error("Post is not archived");
    const reason = parsePost(requiredText("Reason"), rawReason);
    const images = [
      ...collectImageIds(post.content),
      ...collectImageIds(post.draftContent),
    ];
    // Delete first so releaseImages' reference scan no longer sees this post.
    await ctx.db.delete(postId);
    await releaseImages(ctx, images, []);
    await writeAudit(ctx, {
      actor,
      action: "content.blogPost.deleted",
      entityType: "blogPosts",
      entityId: postId,
      reason,
    });
  },
});

export const listPosts = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "content.author");
    const posts = await ctx.db.query("blogPosts").order("desc").collect();
    return await Promise.all(
      posts.map(async (post) => ({
        ...post,
        imageUrl: await imageUrl(
          ctx,
          ((post.draftContent ?? post.content) as BlogPostContent | undefined)
            ?.coverImage?.storageId,
        ),
      })),
    );
  },
});

export const getPost = query({
  args: { postId: v.id("blogPosts") },
  handler: async (ctx, { postId }) => {
    await requireCapability(ctx, "content.author");
    const post = await ctx.db.get(postId);
    return post
      ? {
          ...post,
          imageUrls: await sectionImageUrls(
            ctx,
            post.content as BlogPostContent | undefined,
            post.draftContent as BlogPostContent | undefined,
          ),
        }
      : null;
  },
});

export const listPublishedPosts = query({
  args: {},
  handler: async (ctx) => {
    // Deliberately public marketing content; the authorization matrix pins
    // this exemption and the projection below excludes internal fields.
    await ctx.auth.getUserIdentity();
    const posts = await ctx.db
      .query("blogPosts")
      .withIndex("by_status_published", (q) => q.eq("status", "published"))
      .order("desc")
      .collect();
    return await Promise.all(posts.map((post) => toPublicPost(ctx, post)));
  },
});

export const getPublishedPost = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    // Deliberately public marketing content; the authorization matrix pins
    // this exemption and the projection below excludes internal fields.
    await ctx.auth.getUserIdentity();
    const post = await ctx.db
      .query("blogPosts")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    return post?.status === "published" ? await toPublicPost(ctx, post) : null;
  },
});
