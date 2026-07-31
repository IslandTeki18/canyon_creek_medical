// Patient documents (Increment 11.2). Uploads are validated before they are
// ever attached to a chart, rejected files are deleted from storage, and
// downloads run through short-lived single-use grants whose authorization is
// re-checked at download time — not only when the link was created.
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import {
  activeLinkForUser,
  requireAuthenticatedUser,
  requireCapability,
  requireLinkedPatient,
} from "../lib/access";
import { writeAudit } from "../lib/audit";
import {
  DOWNLOAD_GRANT_TTL_MS,
  safeFileName,
  validateUpload,
} from "../lib/documents";
import {
  generateInvitationToken,
  hashInvitationToken,
} from "../lib/invitations";
import { hasCapability } from "../lib/permissions";

/**
 * The one read gate for document bytes and metadata. Staff read through
 * patient.read; a patient reads only their own patient-visible documents.
 */
export async function canAccessDocument(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  document: Doc<"documents">,
): Promise<boolean> {
  if (hasCapability(user.roles, "patient.read")) return true;
  if (!hasCapability(user.roles, "portal.access")) return false;
  if (document.visibility !== "patient") return false;
  const link = await activeLinkForUser(ctx, user._id);
  return link?.patientId === document.patientId;
}

async function requireDocumentAccess(
  ctx: QueryCtx | MutationCtx,
  documentId: Id<"documents">,
): Promise<{ document: Doc<"documents">; actor: Doc<"users"> }> {
  const document = await ctx.db.get(documentId);
  if (!document) throw new Error("Document not found");
  const actor = await requireAuthenticatedUser(ctx);
  if (!(await canAccessDocument(ctx, actor, document))) {
    throw new Error("Not authorized");
  }
  return { document, actor };
}

/**
 * Issues a storage upload URL. Requires the same authority as attaching the
 * document, so an unauthorized caller cannot even place bytes in storage.
 */
export const generateUploadUrl = mutation({
  args: { patientId: v.optional(v.id("patients")) },
  handler: async (ctx, args) => {
    if (args.patientId) {
      await requireCapability(ctx, "patient.manage");
    } else {
      await requireLinkedPatient(ctx); // portal upload, own chart only
    }
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Completes an upload. Size always comes from storage metadata, and the
 * content type does too whenever the upload carried one — the client-declared
 * type is only a fallback. Byte-level content verification is the scanner's
 * job (docs/DOCUMENTS.md), not this check. Rejections return a result rather
 * than throwing: a throw would roll the transaction back and leave the
 * rejected bytes sitting in storage.
 */
export const attachDocument = mutation({
  args: {
    // Staff supply a patient; portal callers omit it and get their own.
    patientId: v.optional(v.id("patients")),
    storageId: v.id("_storage"),
    category: v.string(),
    title: v.string(),
    mimeType: v.optional(v.string()),
    fileName: v.optional(v.string()), // checked for extension only, not stored
  },
  handler: async (ctx, args) => {
    const staff = args.patientId !== undefined;
    const owner = staff ? null : await requireLinkedPatient(ctx);
    const actor = owner
      ? owner.user
      : await requireCapability(ctx, "patient.manage");
    const patientId = args.patientId ?? owner!.patient._id;
    const title = args.title.trim();

    const stored = await ctx.db.system.get(args.storageId);
    if (!stored) throw new Error("Upload not found");
    const mimeType = stored.contentType ?? args.mimeType ?? "";
    const sizeBytes = stored.size;

    let extension: string;
    try {
      if (!title) throw new Error("A document title is required");
      extension = validateUpload({
        category: args.category,
        mimeType,
        sizeBytes,
        fileName: args.fileName,
      });
    } catch (error) {
      // Commit the cleanup: a rejected file never becomes available.
      await ctx.storage.delete(args.storageId);
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Rejected",
      };
    }

    const now = Date.now();
    const documentId = await ctx.db.insert("documents", {
      patientId,
      category: args.category,
      title,
      source: staff ? "staff" : "patient",
      // Patient uploads are always pending review before broader clinical use.
      visibility: staff ? "staff" : "patient",
      reviewStatus: staff ? "accepted" : "pending",
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    const versionId = await insertVersion(ctx, {
      documentId,
      version: 1,
      storageId: args.storageId,
      extension,
      mimeType,
      sizeBytes,
      uploadedByUserId: actor._id,
    });
    await ctx.db.patch(documentId, { currentVersionId: versionId });
    await writeAudit(ctx, {
      actor,
      action: "document.uploaded",
      entityType: "documents",
      entityId: documentId,
      reason: args.category,
    });
    return { ok: true as const, documentId };
  },
});

export async function insertVersion(
  ctx: MutationCtx,
  args: {
    documentId: Id<"documents">;
    version: number;
    storageId: Id<"_storage">;
    extension: string;
    mimeType: string;
    sizeBytes: number;
    uploadedByUserId: Id<"users">;
  },
): Promise<Id<"documentVersions">> {
  return await ctx.db.insert("documentVersions", {
    ...args,
    scanStatus: "pending",
    createdAt: Date.now(),
  });
}

/**
 * Malware-scanning boundary. Today a scan result is recorded explicitly;
 * a scanner integration replaces this caller without changing the rule that
 * nothing leaves storage before a clean result. See docs/DOCUMENTS.md.
 */
export const recordScanResult = mutation({
  args: {
    versionId: v.id("documentVersions"),
    result: v.union(v.literal("clean"), v.literal("quarantined")),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "config.manage");
    const version = await ctx.db.get(args.versionId);
    if (!version) throw new Error("Document version not found");
    await ctx.db.patch(version._id, { scanStatus: args.result });
    await writeAudit(ctx, {
      actor,
      action: `document.scan.${args.result}`,
      entityType: "documentVersions",
      entityId: version._id,
    });
  },
});

export const listForPatient = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedUser(ctx);
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
      .collect();
    const visible: (Doc<"documents"> & {
      versions: Doc<"documentVersions">[];
    })[] = [];
    for (const document of documents) {
      if (document.archivedAt) continue;
      if (!(await canAccessDocument(ctx, actor, document))) continue;
      visible.push({
        ...document,
        versions: await ctx.db
          .query("documentVersions")
          .withIndex("by_document", (q) => q.eq("documentId", document._id))
          .collect(),
      });
    }
    return visible.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * Mints a single-use download token. The returned path is only usable by
 * this user, only until it expires, and only once.
 */
export const createDownloadGrant = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const { document, actor } = await requireDocumentAccess(
      ctx,
      args.documentId,
    );
    if (document.archivedAt) throw new Error("Document is archived");
    if (!document.currentVersionId) throw new Error("Document has no file");
    const version = await ctx.db.get(document.currentVersionId);
    if (!version) throw new Error("Document has no file");
    if (version.scanStatus !== "clean") {
      throw new Error("File is not available for download yet");
    }
    const token = generateInvitationToken();
    await ctx.db.insert("documentDownloadGrants", {
      versionId: version._id,
      userId: actor._id,
      tokenHash: await hashInvitationToken(token),
      expiresAt: Date.now() + DOWNLOAD_GRANT_TTL_MS,
      createdAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "document.download_granted",
      entityType: "documents",
      entityId: document._id,
    });
    // Path only — the caller joins it to the Convex site URL. No PHI.
    return `/documents/download?token=${token}`;
  },
});

/**
 * Consumes a grant for the HTTP download route. Authorization is evaluated
 * here, at download time: the user must still be active and still permitted
 * to read the document, and the file must still be clean and unarchived.
 */
export const consumeDownloadGrant = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const tokenHash = await hashInvitationToken(args.token);
    const grant = await ctx.db
      .query("documentDownloadGrants")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    const now = Date.now();
    if (!grant || grant.consumedAt || grant.expiresAt < now) return null;
    await ctx.db.patch(grant._id, { consumedAt: now });

    const [version, user] = await Promise.all([
      ctx.db.get(grant.versionId),
      ctx.db.get(grant.userId),
    ]);
    if (!version || version.scanStatus !== "clean") return null;
    if (!user || user.status !== "active") return null;
    const document = await ctx.db.get(version.documentId);
    if (!document || document.archivedAt) return null;
    if (!(await canAccessDocument(ctx, user, document))) return null;

    await writeAudit(ctx, {
      actor: user,
      action: "document.downloaded",
      entityType: "documents",
      entityId: document._id,
    });
    return {
      storageId: version.storageId,
      mimeType: version.mimeType,
      fileName: safeFileName({
        category: document.category,
        documentId: document._id,
        version: version.version,
        extension: version.extension,
      }),
    };
  },
});

export const archiveDocument = mutation({
  args: { documentId: v.id("documents"), reason: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "patient.manage");
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Document not found");
    const reason = args.reason.trim();
    if (!reason) throw new Error("A reason is required");
    await ctx.db.patch(document._id, {
      archivedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "document.archived",
      entityType: "documents",
      entityId: document._id,
      reason,
    });
  },
});
