import { ConvexError, v } from "convex/values";
import { z } from "zod";
import type { Doc, Id } from "../_generated/dataModel";
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
const requiredText = (label: string) =>
  z.string().trim().min(1, `${label} is required`);
const draftText = () => z.string();
const postSchema = (text: (label: string) => z.ZodString) =>
  z
    .object({
      title: text("Title"),
      category: categorySchema,
      excerpt: text("Excerpt").max(
        300,
        "Excerpt must be at most 300 characters",
      ),
      body: text("Body"),
      authorName: text("Author name"),
      imageStorageId: z.custom<Id<"_storage">>().optional(),
    })
    .strict();
const contentSchema = postSchema(requiredText);
const draftSchema = postSchema(draftText);
const updateSchema = draftSchema
  .partial()
  .refine(
    (update) => Object.keys(update).length > 0,
    "At least one post field is required",
  );

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

type BlogPostContent = z.output<typeof contentSchema>;

async function imageUrl(ctx: QueryCtx, storageId?: Id<"_storage">) {
  return storageId ? await ctx.storage.getUrl(storageId) : null;
}

async function toPublicPost(ctx: QueryCtx, doc: Doc<"blogPosts">) {
  if (!doc.content) throw new Error("Published blog post has no content");
  const { title, category, excerpt, body, authorName, imageStorageId } =
    doc.content as BlogPostContent;
  return {
    slug: doc.slug,
    title,
    category,
    excerpt,
    body,
    authorName,
    publishedAt: doc.publishedAt,
    imageUrl: await imageUrl(ctx, imageStorageId),
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
  handler: async (ctx, { imageStorageId, slug: rawSlug, ...args }) => {
    const actor = await requireCapability(ctx, "content.author");
    const slug = parsePost(slugSchema, rawSlug);
    const content = parsePost(draftSchema, { ...args, imageStorageId });
    const existing = await ctx.db
      .query("blogPosts")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) throw new Error("Slug already exists");

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
    slug: v.optional(v.string()),
    title: v.optional(v.string()),
    category: v.optional(categoryValidator),
    excerpt: v.optional(v.string()),
    body: v.optional(v.string()),
    authorName: v.optional(v.string()),
    // undefined = leave image as-is; null = remove it
    imageStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  },
  handler: async (ctx, { postId, imageStorageId, slug: rawSlug, ...args }) => {
    const actor = await requireCapability(ctx, "content.author");
    const current = await ctx.db.get(postId);
    if (!current) throw new Error("Post not found");
    if (current.status === "archived") throw new Error("Post is archived");
    const post: z.output<typeof updateSchema> =
      Object.keys(args).length > 0 ||
      (rawSlug === undefined && imageStorageId === undefined)
        ? parsePost(updateSchema, args)
        : {};
    const slug =
      rawSlug === undefined ? undefined : parsePost(slugSchema, rawSlug);
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
    const currentContent = (current.draftContent ?? current.content) as
      BlogPostContent | undefined;
    if (!currentContent) throw new Error("Post has no content");
    const { imageStorageId: _currentImage, ...contentWithoutImage } =
      currentContent;
    await ctx.db.patch(postId, {
      ...(slug !== undefined ? { slug } : {}),
      draftContent:
        imageStorageId === null
          ? { ...contentWithoutImage, ...post }
          : {
              ...currentContent,
              ...post,
              ...(imageStorageId ? { imageStorageId } : {}),
            },
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
    const content = parsePost(
      contentSchema,
      post.draftContent ?? post.content,
      true,
    );
    const now = Date.now();
    await ctx.db.patch(postId, {
      content,
      draftContent: undefined,
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
      updatedAt: Date.now(),
    });
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
            ?.imageStorageId,
        ),
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
