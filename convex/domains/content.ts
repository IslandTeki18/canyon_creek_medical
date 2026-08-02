import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { requireCapability } from "../lib/access";
import { writeAudit } from "../lib/audit";
import { parseServicePageContent } from "../lib/content";

function parseSlug(raw: string) {
  const slug = raw.trim();
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("Invalid slug");
  return slug;
}

function toPublicServicePage(doc: Doc<"servicePages">) {
  return { slug: doc.slug, sortOrder: doc.sortOrder, content: doc.content };
}

export const createServicePage = mutation({
  args: { slug: v.string(), sortOrder: v.number(), content: v.any() },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "config.manage");
    const slug = parseSlug(args.slug);
    const existing = await ctx.db
      .query("servicePages")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) throw new Error("Slug already exists");
    const content = parseServicePageContent(args.content);
    const now = Date.now();
    const servicePageId = await ctx.db.insert("servicePages", {
      slug,
      sortOrder: args.sortOrder,
      content,
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
    sortOrder: v.optional(v.number()),
    content: v.optional(v.any()),
  },
  handler: async (ctx, { servicePageId, sortOrder, content: rawContent }) => {
    const actor = await requireCapability(ctx, "config.manage");
    const page = await ctx.db.get(servicePageId);
    if (!page) throw new Error("Service page not found");
    if (page.status === "archived") throw new Error("Service page is archived");
    if (sortOrder === undefined && rawContent === undefined) {
      throw new Error("At least one service page field is required");
    }
    const content =
      rawContent === undefined
        ? undefined
        : parseServicePageContent(rawContent);
    await ctx.db.patch(servicePageId, {
      sortOrder,
      content,
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

export const publishServicePage = mutation({
  args: { servicePageId: v.id("servicePages") },
  handler: async (ctx, { servicePageId }) => {
    const actor = await requireCapability(ctx, "config.manage");
    const page = await ctx.db.get(servicePageId);
    if (!page) throw new Error("Service page not found");
    if (page.status === "archived") throw new Error("Service page is archived");
    const now = Date.now();
    await ctx.db.patch(servicePageId, {
      status: "published",
      publishedAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "content.servicePage.published",
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
      publishedAt: undefined,
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
    return await ctx.db.get(servicePageId);
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
    return pages.map(toPublicServicePage);
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
    return page?.status === "published" ? toPublicServicePage(page) : null;
  },
});
