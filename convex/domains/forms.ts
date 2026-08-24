import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { requireCapability } from "../lib/access";
import { writeAudit } from "../lib/audit";
import { formDraftSchema, parseDefinition } from "../lib/forms";

// Form template administration. All functions require form.manage.
// Immutability rule: only draft versions may change; publishing freezes a
// version forever and supersedes the previously published one.

export const listTemplates = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "form.manage");
    return await ctx.db.query("formTemplates").collect();
  },
});

export const getTemplate = query({
  args: { templateId: v.id("formTemplates") },
  handler: async (ctx, { templateId }) => {
    await requireCapability(ctx, "form.manage");
    const template = await ctx.db.get(templateId);
    if (!template) return null;
    const versions = await ctx.db
      .query("formVersions")
      .withIndex("by_template", (q) => q.eq("templateId", templateId))
      .order("desc")
      .collect();
    return { template, versions };
  },
});

export const createTemplate = mutation({
  args: {
    name: v.string(),
    type: v.union(
      v.literal("intake"),
      v.literal("consent"),
      v.literal("assessment"),
    ),
  },
  handler: async (ctx, { name, type }) => {
    const actor = await requireCapability(ctx, "form.manage");
    if (!name.trim()) throw new Error("A template name is required");
    const now = Date.now();
    const templateId = await ctx.db.insert("formTemplates", {
      name: name.trim(),
      type,
      status: "active",
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "form.template.created",
      entityType: "formTemplates",
      entityId: templateId,
    });
    return templateId;
  },
});

async function latestVersion(
  ctx: QueryCtx,
  templateId: Id<"formTemplates">,
): Promise<Doc<"formVersions"> | null> {
  return await ctx.db
    .query("formVersions")
    .withIndex("by_template", (q) => q.eq("templateId", templateId))
    .order("desc")
    .first();
}

export async function publishedVersion(
  ctx: QueryCtx,
  templateId: Id<"formTemplates">,
): Promise<Doc<"formVersions"> | null> {
  return await ctx.db
    .query("formVersions")
    .withIndex("by_template_status", (q) =>
      q.eq("templateId", templateId).eq("status", "published"),
    )
    .unique();
}

/** New draft; starts from the latest version's definition when one exists. */
export const createDraftVersion = mutation({
  args: {
    templateId: v.id("formTemplates"),
    definition: v.optional(v.any()),
  },
  handler: async (ctx, { templateId, definition }) => {
    const actor = await requireCapability(ctx, "form.manage");
    const template = await ctx.db.get(templateId);
    if (!template) throw new Error("Template not found");
    const latest = await latestVersion(ctx, templateId);
    if (latest?.status === "draft") {
      throw new Error("A draft already exists for this template");
    }
    const parsed = formDraftSchema.parse(
      definition ?? latest?.definition ?? { sections: [] },
    );
    const now = Date.now();
    const versionId = await ctx.db.insert("formVersions", {
      templateId,
      version: (latest?.version ?? 0) + 1,
      status: "draft",
      definition: parsed,
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "form.version.draft_created",
      entityType: "formVersions",
      entityId: versionId,
    });
    return versionId;
  },
});

export const updateDraftVersion = mutation({
  args: { versionId: v.id("formVersions"), definition: v.any() },
  handler: async (ctx, { versionId, definition }) => {
    const actor = await requireCapability(ctx, "form.manage");
    const version = await ctx.db.get(versionId);
    if (!version) throw new Error("Version not found");
    if (version.status !== "draft") {
      throw new Error("Only draft versions can be edited");
    }
    await ctx.db.patch(versionId, {
      definition: parseDefinition(definition),
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "form.version.draft_updated",
      entityType: "formVersions",
      entityId: versionId,
    });
  },
});

export const saveDraftDefinition = mutation({
  args: { versionId: v.id("formVersions"), definition: v.any() },
  handler: async (ctx, { versionId, definition }) => {
    await requireCapability(ctx, "form.manage");
    const version = await ctx.db.get(versionId);
    if (!version) throw new Error("Version not found");
    if (version.status !== "draft") {
      throw new Error("Only draft versions can be edited");
    }
    await ctx.db.patch(versionId, {
      definition: formDraftSchema.parse(definition),
      updatedAt: Date.now(),
    });
  },
});

/** Publishes a draft and supersedes the previously published version. */
export const publishVersion = mutation({
  args: { versionId: v.id("formVersions") },
  handler: async (ctx, { versionId }) => {
    const actor = await requireCapability(ctx, "form.manage");
    const version = await ctx.db.get(versionId);
    if (!version) throw new Error("Version not found");
    if (version.status !== "draft") {
      throw new Error("Only draft versions can be published");
    }
    // Re-validate at the boundary: never publish an invalid definition.
    parseDefinition(version.definition);
    const now = Date.now();
    const current = await publishedVersion(ctx, version.templateId);
    if (current) {
      await ctx.db.patch(current._id, { status: "superseded", updatedAt: now });
    }
    await ctx.db.patch(versionId, {
      status: "published",
      publishedAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "form.version.published",
      entityType: "formVersions",
      entityId: versionId,
    });
  },
});

/** Retire hides a template from new use; restore re-activates it. */
export const setTemplateStatus = mutation({
  args: {
    templateId: v.id("formTemplates"),
    status: v.union(v.literal("active"), v.literal("retired")),
    reason: v.string(),
  },
  handler: async (ctx, { templateId, status, reason }) => {
    const actor = await requireCapability(ctx, "form.manage");
    if (!reason.trim()) throw new Error("A reason is required");
    const template = await ctx.db.get(templateId);
    if (!template) throw new Error("Template not found");
    if (template.status !== status) {
      await ctx.db.patch(templateId, { status, updatedAt: Date.now() });
    }
    await writeAudit(ctx, {
      actor,
      action:
        status === "retired"
          ? "form.template.retired"
          : "form.template.restored",
      entityType: "formTemplates",
      entityId: templateId,
      reason,
    });
  },
});
