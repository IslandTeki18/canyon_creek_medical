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
  isDocumentCategory,
  safeFileName,
  validateUpload,
} from "../lib/documents";
import {
  generateInvitationToken,
  hashInvitationToken,
} from "../lib/invitations";
import { hasCapability } from "../lib/permissions";
import { enqueuePatientNotification } from "./communications";
import { createTaskInternal } from "./tasks";

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
    // Patient uploads become traceable work rather than sitting unnoticed.
    if (!staff) await raiseReviewTask(ctx, { actor, documentId });
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

/** Portal view: the caller's own patient-visible documents. */
export const myDocuments = query({
  args: {},
  handler: async (ctx) => {
    const { patient } = await requireLinkedPatient(ctx);
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
      .collect();
    return await Promise.all(
      documents
        .filter(
          (document) =>
            !document.archivedAt && document.visibility === "patient",
        )
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(async (document) => {
          const version = document.currentVersionId
            ? await ctx.db.get(document.currentVersionId)
            : null;
          return {
            _id: document._id,
            title: document.title,
            category: document.category,
            reviewStatus: document.reviewStatus,
            reviewNote: document.reviewNote,
            scanStatus: version?.scanStatus ?? "pending",
            createdAt: document.createdAt,
          };
        }),
    );
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

// --- 11.3 Review workflow ---------------------------------------------

/** Queue key for document review work. Created by an administrator (11.1). */
export const DOCUMENT_REVIEW_QUEUE = "documentReview";

/**
 * Raises review work for a patient upload. Silently skips when the queue is
 * not configured — an unconfigured queue must not block a patient's upload.
 */
async function raiseReviewTask(
  ctx: MutationCtx,
  args: { actor: Doc<"users">; documentId: Id<"documents"> },
): Promise<void> {
  const document = await ctx.db.get(args.documentId);
  if (!document) return;
  const queue = await ctx.db
    .query("taskQueues")
    .withIndex("by_key", (q) => q.eq("key", DOCUMENT_REVIEW_QUEUE))
    .unique();
  if (!queue?.active) return;
  await createTaskInternal(ctx, {
    actor: args.actor,
    queueKey: DOCUMENT_REVIEW_QUEUE,
    // Neutral label: category only, never the document's contents.
    title: `Review uploaded ${document.category} document`,
    patientId: document.patientId,
    entityType: "documents",
    entityId: document._id,
  });
}

/** Closes any open review tasks for a document once it has been reviewed. */
async function closeReviewTasks(
  ctx: MutationCtx,
  args: { actor: Doc<"users">; documentId: Id<"documents"> },
): Promise<void> {
  const open = await ctx.db
    .query("tasks")
    .withIndex("by_queue_status", (q) =>
      q.eq("queueKey", DOCUMENT_REVIEW_QUEUE).eq("status", "open"),
    )
    .collect();
  for (const task of open.filter((t) => t.entityId === args.documentId)) {
    await ctx.db.patch(task._id, {
      status: "completed",
      closedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.insert("taskEvents", {
      taskId: task._id,
      kind: "status",
      detail: "open → completed: document reviewed",
      actorUserId: args.actor._id,
      createdAt: Date.now(),
    });
  }
}

/** Documents awaiting staff review, oldest first. */
export const listReviewQueue = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "patient.manage");
    const pending = await ctx.db
      .query("documents")
      .withIndex("by_review_status", (q) => q.eq("reviewStatus", "pending"))
      .collect();
    return await Promise.all(
      pending
        .filter((document) => !document.archivedAt)
        .map(async (document) => {
          const patient = await ctx.db.get(document.patientId);
          const version = document.currentVersionId
            ? await ctx.db.get(document.currentVersionId)
            : null;
          return {
            ...document,
            patientName: patient
              ? `${patient.legalLastName}, ${patient.legalFirstName}`
              : "(unknown)",
            scanStatus: version?.scanStatus ?? "pending",
          };
        }),
    );
  },
});

/**
 * Records a staff review decision. A patient upload stays out of broader
 * clinical use until this runs: only "accepted" documents may be linked to
 * clinical records. Replacement requests and availability notices reach the
 * patient through neutral templates that name no document detail.
 */
export const reviewDocument = mutation({
  args: {
    documentId: v.id("documents"),
    decision: v.union(
      v.literal("accepted"),
      v.literal("replacementRequested"),
      v.literal("restricted"),
    ),
    category: v.optional(v.string()), // recategorize while accepting
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "patient.manage");
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Document not found");
    if (document.archivedAt) throw new Error("Document is archived");
    const note = args.note?.trim();
    if (args.decision !== "accepted" && !note) {
      throw new Error("A reason is required");
    }
    if (args.category !== undefined && !isDocumentCategory(args.category)) {
      throw new Error("Unsupported document category");
    }
    const now = Date.now();
    await ctx.db.patch(document._id, {
      reviewStatus: args.decision,
      category: args.category ?? document.category,
      // Restricting hides the document from the portal without deleting it.
      visibility:
        args.decision === "restricted" ? "staff" : document.visibility,
      reviewedByUserId: actor._id,
      reviewedAt: now,
      reviewNote: note,
      updatedAt: now,
    });
    await closeReviewTasks(ctx, { actor, documentId: document._id });
    if (args.decision === "replacementRequested") {
      await enqueuePatientNotification(ctx, {
        patientId: document.patientId,
        intent: "documentAttentionNeeded",
        referenceId: document._id,
      });
    }
    await writeAudit(ctx, {
      actor,
      action: `document.review.${args.decision}`,
      entityType: "documents",
      entityId: document._id,
      reason: note ?? args.category,
    });
  },
});

/**
 * Publishes a staff document to the patient portal and sends the neutral
 * availability notice. Withdrawal is a second call with visible=false.
 */
export const setPatientVisibility = mutation({
  args: { documentId: v.id("documents"), visible: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "patient.manage");
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Document not found");
    if (document.archivedAt) throw new Error("Document is archived");
    if (args.visible && document.reviewStatus !== "accepted") {
      throw new Error("Only accepted documents can be shared with a patient");
    }
    await ctx.db.patch(document._id, {
      visibility: args.visible ? "patient" : "staff",
      updatedAt: Date.now(),
    });
    if (args.visible) {
      await enqueuePatientNotification(ctx, {
        patientId: document.patientId,
        intent: "documentAvailable",
        referenceId: document._id,
      });
    }
    await writeAudit(ctx, {
      actor,
      action: args.visible ? "document.shared" : "document.unshared",
      entityType: "documents",
      entityId: document._id,
    });
  },
});

/**
 * Adds a replacement version. The prior version is superseded, never
 * removed, so the review history stays reconstructable.
 */
export const addVersion = mutation({
  args: {
    documentId: v.id("documents"),
    storageId: v.id("_storage"),
    mimeType: v.optional(v.string()),
    fileName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { document, actor } = await requireDocumentAccess(
      ctx,
      args.documentId,
    );
    if (document.archivedAt) throw new Error("Document is archived");
    const stored = await ctx.db.system.get(args.storageId);
    if (!stored) throw new Error("Upload not found");
    const mimeType = stored.contentType ?? args.mimeType ?? "";
    let extension: string;
    try {
      extension = validateUpload({
        category: document.category,
        mimeType,
        sizeBytes: stored.size,
        fileName: args.fileName,
      });
    } catch (error) {
      await ctx.storage.delete(args.storageId);
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Rejected",
      };
    }
    const versions = await ctx.db
      .query("documentVersions")
      .withIndex("by_document", (q) => q.eq("documentId", document._id))
      .collect();
    const now = Date.now();
    for (const version of versions) {
      if (!version.supersededAt) {
        await ctx.db.patch(version._id, { supersededAt: now });
      }
    }
    const versionId = await insertVersion(ctx, {
      documentId: document._id,
      version: versions.length + 1,
      storageId: args.storageId,
      extension,
      mimeType,
      sizeBytes: stored.size,
      uploadedByUserId: actor._id,
    });
    await ctx.db.patch(document._id, {
      currentVersionId: versionId,
      // A replacement re-enters review regardless of who uploaded it.
      reviewStatus: "pending",
      updatedAt: now,
    });
    await raiseReviewTask(ctx, { actor, documentId: document._id });
    await writeAudit(ctx, {
      actor,
      action: "document.version_added",
      entityType: "documents",
      entityId: document._id,
    });
    return { ok: true as const, versionId };
  },
});

/**
 * Links a reviewed document to the record it supports. The file is
 * referenced, never copied into the encounter or monitoring record.
 */
export const linkDocument = mutation({
  args: {
    documentId: v.id("documents"),
    entityType: v.union(
      v.literal("encounters"),
      v.literal("toxicologyRecords"),
      v.literal("ketamineSessions"),
    ),
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Document not found");
    if (document.reviewStatus !== "accepted") {
      throw new Error("Only reviewed documents can be linked");
    }
    const links = document.links ?? [];
    if (
      !links.some(
        (link) =>
          link.entityType === args.entityType &&
          link.entityId === args.entityId,
      )
    ) {
      links.push({ entityType: args.entityType, entityId: args.entityId });
    }
    await ctx.db.patch(document._id, { links, updatedAt: Date.now() });
    await writeAudit(ctx, {
      actor,
      action: "document.linked",
      entityType: "documents",
      entityId: document._id,
      reason: args.entityType,
    });
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
