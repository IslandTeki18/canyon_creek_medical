import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { requireCapability } from "../lib/access";
import { writeAudit } from "../lib/audit";
import {
  parseServicePageContent,
  parseServicePageDraft,
  slugify,
  type ServicePageContent,
} from "../lib/content";
import {
  collectImageIds,
  contentImageProblem,
  releaseImages,
} from "../lib/contentImages";

async function sectionImageUrls(
  ctx: QueryCtx,
  ...contents: (ServicePageContent | undefined)[]
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

async function toPublicServicePage(ctx: QueryCtx, doc: Doc<"servicePages">) {
  if (!doc.content) throw new Error("Published service page has no content");
  const content = doc.content as ServicePageContent;
  const { coverImage, ...publicContent } = content;
  return {
    slug: doc.slug,
    sortOrder: doc.sortOrder,
    content: publicContent,
    coverImage: coverImage
      ? {
          url: await ctx.storage.getUrl(coverImage.storageId),
          alt: coverImage.alt,
        }
      : null,
    imageUrls: await sectionImageUrls(ctx, content),
  };
}

const imageFor = v.union(v.literal("servicePage"), v.literal("blogPost"));

async function requireImageCapability(
  ctx: Parameters<typeof requireCapability>[0],
  target: "servicePage" | "blogPost",
) {
  return await requireCapability(
    ctx,
    target === "servicePage" ? "config.manage" : "content.author",
  );
}

export const generateContentImageUploadUrl = mutation({
  args: { for: imageFor },
  handler: async (ctx, args) => {
    await requireImageCapability(ctx, args.for);
    return await ctx.storage.generateUploadUrl();
  },
});

export const confirmContentImage = mutation({
  args: { storageId: v.id("_storage"), for: imageFor },
  handler: async (ctx, args) => {
    await requireImageCapability(ctx, args.for);
    const problem = contentImageProblem(
      await ctx.db.system.get(args.storageId),
    );
    if (problem) {
      await ctx.storage.delete(args.storageId);
      return { ok: false as const, error: problem };
    }
    return { ok: true as const };
  },
});

async function imageIssues(ctx: QueryCtx, content: ServicePageContent) {
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

export const createServicePage = mutation({
  args: { title: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "config.manage");
    const slug = slugify(args.title);
    if (!slug)
      throw new Error("Title must include at least one letter or number");
    const existing = await ctx.db
      .query("servicePages")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) throw new Error("A page with this address already exists");
    const pages = await ctx.db.query("servicePages").collect();
    const sortOrder = pages.length
      ? Math.max(...pages.map((page) => page.sortOrder)) + 1
      : 0;
    const content = parseServicePageDraft({
      title: args.title,
      icon: "",
      summary: "",
      chips: [],
      tags: [],
      intro: "",
      sections: [],
      facts: [],
      safetyNote: "",
    });
    const now = Date.now();
    const servicePageId = await ctx.db.insert("servicePages", {
      slug,
      sortOrder,
      draftContent: content,
      status: "draft",
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "content.servicePage.created",
      entityType: "servicePages",
      entityId: servicePageId,
    });
    return servicePageId;
  },
});

export const updateServicePage = mutation({
  args: {
    servicePageId: v.id("servicePages"),
    sortOrder: v.number(),
  },
  handler: async (ctx, { servicePageId, sortOrder }) => {
    const actor = await requireCapability(ctx, "config.manage");
    const page = await ctx.db.get(servicePageId);
    if (!page) throw new Error("Service page not found");
    if (page.status === "archived") throw new Error("Service page is archived");
    await ctx.db.patch(servicePageId, {
      sortOrder,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "content.servicePage.updated",
      entityType: "servicePages",
      entityId: servicePageId,
    });
  },
});

export const saveServicePageDraft = mutation({
  args: { servicePageId: v.id("servicePages"), content: v.any() },
  handler: async (ctx, { servicePageId, content: rawContent }) => {
    const actor = await requireCapability(ctx, "config.manage");
    const page = await ctx.db.get(servicePageId);
    if (!page) throw new Error("Service page not found");
    if (page.status === "archived") throw new Error("Service page is archived");
    const content = parseServicePageDraft(rawContent);
    const before = collectImageIds(page.draftContent);
    await ctx.db.patch(servicePageId, {
      draftContent: content,
      draftUpdatedAt: Date.now(),
      draftUpdatedByUserId: actor._id,
    });
    if (!page.content)
      await releaseImages(ctx, before, collectImageIds(content));
  },
});

export const publishServicePage = mutation({
  args: { servicePageId: v.id("servicePages") },
  handler: async (ctx, { servicePageId }) => {
    const actor = await requireCapability(ctx, "config.manage");
    const page = await ctx.db.get(servicePageId);
    if (!page) throw new Error("Service page not found");
    if (page.status === "archived") throw new Error("Service page is archived");
    const content = parseServicePageContent(page.draftContent ?? page.content);
    await imageIssues(ctx, content);
    const before = collectImageIds(page.content);
    const now = Date.now();
    await ctx.db.patch(servicePageId, {
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
      action: "content.servicePage.published",
      entityType: "servicePages",
      entityId: servicePageId,
    });
  },
});

export const discardServicePageDraft = mutation({
  args: { servicePageId: v.id("servicePages") },
  handler: async (ctx, { servicePageId }) => {
    const actor = await requireCapability(ctx, "config.manage");
    const page = await ctx.db.get(servicePageId);
    if (!page) throw new Error("Service page not found");
    if (page.status === "archived") throw new Error("Service page is archived");
    if (!page.draftContent) throw new Error("Service page has no draft");
    await ctx.db.patch(servicePageId, {
      draftContent: undefined,
      draftUpdatedAt: undefined,
      draftUpdatedByUserId: undefined,
      updatedAt: Date.now(),
    });
    await releaseImages(
      ctx,
      collectImageIds(page.draftContent),
      collectImageIds(page.content),
    );
    await writeAudit(ctx, {
      actor,
      action: "content.servicePage.draftDiscarded",
      entityType: "servicePages",
      entityId: servicePageId,
    });
  },
});

export const unpublishServicePage = mutation({
  args: { servicePageId: v.id("servicePages") },
  handler: async (ctx, { servicePageId }) => {
    const actor = await requireCapability(ctx, "config.manage");
    const page = await ctx.db.get(servicePageId);
    if (!page) throw new Error("Service page not found");
    if (page.status === "archived") throw new Error("Service page is archived");
    await ctx.db.patch(servicePageId, {
      status: "draft",
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "content.servicePage.unpublished",
      entityType: "servicePages",
      entityId: servicePageId,
    });
  },
});

export const archiveServicePage = mutation({
  args: { servicePageId: v.id("servicePages"), reason: v.string() },
  handler: async (ctx, { servicePageId, reason: rawReason }) => {
    const actor = await requireCapability(ctx, "config.manage");
    const page = await ctx.db.get(servicePageId);
    if (!page) throw new Error("Service page not found");
    if (page.status === "archived") throw new Error("Service page is archived");
    const reason = rawReason.trim();
    if (!reason) throw new Error("Archive reason is required");
    const now = Date.now();
    await ctx.db.patch(servicePageId, {
      status: "archived",
      archivedAt: now,
      archiveReason: reason,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "content.servicePage.archived",
      entityType: "servicePages",
      entityId: servicePageId,
      reason,
    });
  },
});

export const restoreServicePage = mutation({
  args: { servicePageId: v.id("servicePages") },
  handler: async (ctx, { servicePageId }) => {
    const actor = await requireCapability(ctx, "config.manage");
    const page = await ctx.db.get(servicePageId);
    if (!page) throw new Error("Service page not found");
    if (page.status !== "archived") {
      throw new Error("Service page is not archived");
    }
    await ctx.db.patch(servicePageId, {
      status: page.content ? "published" : "draft",
      archivedAt: undefined,
      archiveReason: undefined,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "content.servicePage.restored",
      entityType: "servicePages",
      entityId: servicePageId,
    });
  },
});

export const listServicePages = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "config.manage");
    const pages = await ctx.db.query("servicePages").collect();
    return pages.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const getServicePage = query({
  args: { servicePageId: v.id("servicePages") },
  handler: async (ctx, { servicePageId }) => {
    await requireCapability(ctx, "config.manage");
    const page = await ctx.db.get(servicePageId);
    return page
      ? {
          ...page,
          imageUrls: await sectionImageUrls(
            ctx,
            page.content as ServicePageContent | undefined,
            page.draftContent as ServicePageContent | undefined,
          ),
        }
      : null;
  },
});

export const listPublishedServicePages = query({
  args: {},
  handler: async (ctx) => {
    // Deliberately public marketing content; projection excludes internal fields.
    await ctx.auth.getUserIdentity();
    const pages = await ctx.db
      .query("servicePages")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();
    return await Promise.all(
      pages.map((page) => toPublicServicePage(ctx, page)),
    );
  },
});

export const getPublishedServicePage = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    // Deliberately public marketing content; projection excludes internal fields.
    await ctx.auth.getUserIdentity();
    const page = await ctx.db
      .query("servicePages")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    return page?.status === "published"
      ? await toPublicServicePage(ctx, page)
      : null;
  },
});
