import { v } from "convex/values";
import { z } from "zod";
import type { Doc } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { requireCapability } from "../lib/access";
import { writeAudit } from "../lib/audit";

const categoryValidator = v.union(
  v.literal("Mental health"),
  v.literal("Addiction medicine"),
  v.literal("Holistic care"),
  v.literal("Practice news"),
);

const categorySchema = z.enum([
  "Mental health",
  "Addiction medicine",
  "Holistic care",
  "Practice news",
]);
const slugSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]+$/, "Invalid slug");
const text = (label: string) =>
  z.string().trim().min(1, `${label} is required`);
const postSchema = z.object({
  slug: slugSchema,
  title: text("Title"),
  category: categorySchema,
  excerpt: text("Excerpt").max(300, "Excerpt must be at most 300 characters"),
  body: text("Body"),
  authorName: text("Author name"),
});
const updateSchema = postSchema
  .partial()
  .refine(
    (update) => Object.keys(update).length > 0,
    "At least one post field is required",
  );

function parsePost<T extends z.ZodType>(
  schema: T,
  value: unknown,
): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid post");
  }
  return result.data;
}

async function imageUrl(ctx: QueryCtx, doc: Doc<"blogPosts">) {
  return doc.imageStorageId
    ? await ctx.storage.getUrl(doc.imageStorageId)
    : null;
}

async function toPublicPost(ctx: QueryCtx, doc: Doc<"blogPosts">) {
  const { slug, title, category, excerpt, body, authorName, publishedAt } = doc;
  return {
    slug,
    title,
    category,
    excerpt,
    body,
    authorName,
    publishedAt,
    imageUrl: await imageUrl(ctx, doc),
  };
}

export const generateImageUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "content.author");
    return await ctx.storage.generateUploadUrl();
  },
});

export const createPost = mutation({
  args: {
    slug: v.string(),
    title: v.string(),
    category: categoryValidator,
    excerpt: v.string(),
    body: v.string(),
    authorName: v.string(),
    imageStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, { imageStorageId, ...args }) => {
    const actor = await requireCapability(ctx, "content.author");
    const post = parsePost(postSchema, args);
    const existing = await ctx.db
      .query("blogPosts")
      .withIndex("by_slug", (q) => q.eq("slug", post.slug))
      .unique();
    if (existing) throw new Error("Slug already exists");

    const now = Date.now();
    const postId = await ctx.db.insert("blogPosts", {
      ...post,
      ...(imageStorageId ? { imageStorageId } : {}),
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
    slug: v.optional(v.string()),
    title: v.optional(v.string()),
    category: v.optional(categoryValidator),
    excerpt: v.optional(v.string()),
    body: v.optional(v.string()),
    authorName: v.optional(v.string()),
    // undefined = leave image as-is; null = remove it
    imageStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  },
  handler: async (ctx, { postId, imageStorageId, ...args }) => {
    const actor = await requireCapability(ctx, "content.author");
    const current = await ctx.db.get(postId);
    if (!current) throw new Error("Post not found");
    if (current.status === "archived") throw new Error("Post is archived");
    const post: z.output<typeof updateSchema> =
      Object.keys(args).length > 0 || imageStorageId === undefined
        ? parsePost(updateSchema, args)
        : {};
    if (
      post.slug &&
      post.slug !== current.slug &&
      current.publishedAt !== undefined
    ) {
      throw new Error("Slug cannot be changed after publishing");
    }
    if (post.slug && post.slug !== current.slug) {
      const existing = await ctx.db
        .query("blogPosts")
        .withIndex("by_slug", (q) => q.eq("slug", post.slug!))
        .unique();
      if (existing) throw new Error("Slug already exists");
    }
    await ctx.db.patch(postId, {
      ...post,
      ...(imageStorageId !== undefined
        ? { imageStorageId: imageStorageId ?? undefined }
        : {}),
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

export const publishPost = mutation({
  args: { postId: v.id("blogPosts") },
  handler: async (ctx, { postId }) => {
    const actor = await requireCapability(ctx, "content.author");
    const post = await ctx.db.get(postId);
    if (!post) throw new Error("Post not found");
    if (post.status === "archived") throw new Error("Post is archived");
    const now = Date.now();
    await ctx.db.patch(postId, {
      status: "published",
      publishedAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "content.blogPost.published",
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
    const reason = parsePost(text("Reason"), rawReason);
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

export const listPosts = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "content.author");
    const posts = await ctx.db.query("blogPosts").order("desc").collect();
    return await Promise.all(
      posts.map(async (post) => ({
        ...post,
        imageUrl: await imageUrl(ctx, post),
      })),
    );
  },
});

export const getPost = query({
  args: { postId: v.id("blogPosts") },
  handler: async (ctx, { postId }) => {
    await requireCapability(ctx, "content.author");
    return await ctx.db.get(postId);
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
