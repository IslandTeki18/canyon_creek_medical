// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { MAX_DOCUMENT_BYTES, validateUpload } from "../../convex/lib/documents";
import { seedUser } from "../fixtures/forms";
import { seedPatients } from "../fixtures/patients";

const modules = import.meta.glob("../../convex/**/*.ts");

async function storeBlob(
  tx: ReturnType<typeof convexTest>,
  type = "application/pdf",
) {
  return await tx.run(
    async (ctx) => await ctx.storage.store(new Blob(["synthetic"], { type })),
  );
}

async function exists(tx: ReturnType<typeof convexTest>, storageId: string) {
  return await tx.run(
    async (ctx) => (await ctx.db.system.get(storageId as never)) !== null,
  );
}

async function seedWorld(tx: ReturnType<typeof convexTest>) {
  const admin = await seedUser(tx, ["administrator"], "doc_admin");
  const staff = await seedUser(tx, ["frontDesk"], "doc_staff");
  const [patientId] = await seedPatients(tx);
  return { admin, staff, patientId: patientId! };
}

/** Staff upload, marked clean, ready to download. */
async function seedCleanDocument(tx: ReturnType<typeof convexTest>) {
  const world = await seedWorld(tx);
  const result = await world.staff.mutation(
    api.domains.documents.attachDocument,
    {
      patientId: world.patientId,
      storageId: await storeBlob(tx),
      category: "insurance",
      title: "Insurance card",
      mimeType: "application/pdf",
      fileName: "card.pdf",
    },
  );
  if (!result.ok) throw new Error(result.error);
  const versionId = await tx.run(async (ctx) => {
    const doc = await ctx.db.get(result.documentId);
    return doc!.currentVersionId!;
  });
  await world.admin.mutation(api.domains.documents.recordScanResult, {
    versionId,
    result: "clean",
  });
  return { ...world, documentId: result.documentId, versionId };
}

test("size and category limits are enforced", () => {
  expect(() =>
    validateUpload({
      category: "insurance",
      mimeType: "application/pdf",
      sizeBytes: MAX_DOCUMENT_BYTES + 1,
    }),
  ).toThrow("maximum allowed size");
  expect(() =>
    validateUpload({
      category: "notACategory",
      mimeType: "application/pdf",
      sizeBytes: 10,
    }),
  ).toThrow("Unsupported document category");
  expect(() =>
    validateUpload({
      category: "insurance",
      mimeType: "application/pdf",
      sizeBytes: 10,
      fileName: "payload.exe",
    }),
  ).toThrow("File extension does not match");
});

test("rejected uploads never become documents and leave no stored bytes", async () => {
  const tx = convexTest(schema, modules);
  const { staff, patientId } = await seedWorld(tx);
  const storageId = await storeBlob(tx);
  const result = await staff.mutation(api.domains.documents.attachDocument, {
    patientId,
    storageId,
    category: "insurance",
    title: "Script",
    mimeType: "application/x-msdownload",
    fileName: "payload.exe",
  });
  expect(result).toEqual({ ok: false, error: "Unsupported file type" });
  expect(await exists(tx, storageId)).toBe(false);
  expect(
    await staff.query(api.domains.documents.listForPatient, { patientId }),
  ).toEqual([]);
});

test("uploading requires authorization", async () => {
  const tx = convexTest(schema, modules);
  const { patientId } = await seedWorld(tx);
  const auditor = await seedUser(tx, ["auditor"], "doc_auditor");
  await expect(
    auditor.mutation(api.domains.documents.generateUploadUrl, { patientId }),
  ).rejects.toThrow("Not authorized");
  await expect(
    auditor.mutation(api.domains.documents.attachDocument, {
      patientId,
      storageId: await storeBlob(tx),
      category: "insurance",
      title: "Sneaky",
      mimeType: "application/pdf",
    }),
  ).rejects.toThrow("Not authorized");
});

test("files are not downloadable until a scan marks them clean", async () => {
  const tx = convexTest(schema, modules);
  const { staff, patientId } = await seedWorld(tx);
  const result = await staff.mutation(api.domains.documents.attachDocument, {
    patientId,
    storageId: await storeBlob(tx),
    category: "labResult",
    title: "Outside result",
    mimeType: "application/pdf",
  });
  if (!result.ok) throw new Error(result.error);
  await expect(
    staff.mutation(api.domains.documents.createDownloadGrant, {
      documentId: result.documentId,
    }),
  ).rejects.toThrow("not available for download yet");
});

test("a grant is single-use, expiring, and re-checked at download time", async () => {
  const tx = convexTest(schema, modules);
  const { staff, documentId } = await seedCleanDocument(tx);
  const path = await staff.mutation(api.domains.documents.createDownloadGrant, {
    documentId,
  });
  const token = new URLSearchParams(path.split("?")[1]).get("token")!;
  const first = await tx.mutation(
    internal.domains.documents.consumeDownloadGrant,
    { token },
  );
  expect(first?.fileName).toMatch(/^insurance-.*-v1\.pdf$/);
  // Replay produces nothing.
  expect(
    await tx.mutation(internal.domains.documents.consumeDownloadGrant, {
      token,
    }),
  ).toBe(null);

  // A fresh grant is still refused once it has expired.
  const expiring = await staff.mutation(
    api.domains.documents.createDownloadGrant,
    { documentId },
  );
  const expiringToken = new URLSearchParams(expiring.split("?")[1]).get(
    "token",
  )!;
  await tx.run(async (ctx) => {
    const grants = await ctx.db.query("documentDownloadGrants").collect();
    const pending = grants.find((grant) => grant.consumedAt === undefined)!;
    await ctx.db.patch(pending._id, { expiresAt: 1 });
  });
  expect(
    await tx.mutation(internal.domains.documents.consumeDownloadGrant, {
      token: expiringToken,
    }),
  ).toBe(null);

  // Authorization is evaluated at download time, not link creation time.
  const late = await staff.mutation(api.domains.documents.createDownloadGrant, {
    documentId,
  });
  const lateToken = new URLSearchParams(late.split("?")[1]).get("token")!;
  await tx.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", "doc_staff"))
      .unique();
    await ctx.db.patch(user!._id, { status: "suspended" });
  });
  expect(
    await tx.mutation(internal.domains.documents.consumeDownloadGrant, {
      token: lateToken,
    }),
  ).toBe(null);
});

test("unauthorized users cannot read or download another patient's document", async () => {
  const tx = convexTest(schema, modules);
  const { documentId, patientId } = await seedCleanDocument(tx);
  const outsider = await seedUser(tx, ["patient"], "doc_outsider");
  await expect(
    outsider.mutation(api.domains.documents.createDownloadGrant, {
      documentId,
    }),
  ).rejects.toThrow("Not authorized");
  expect(
    await outsider.query(api.domains.documents.listForPatient, { patientId }),
  ).toEqual([]);
});

// 13.4 — File and export security validation.

test.each([
  [
    "disallowed mime type",
    { category: "other", mimeType: "text/html", sizeBytes: 10 },
  ],
  [
    "svg (script-capable)",
    { category: "other", mimeType: "image/svg+xml", sizeBytes: 10 },
  ],
  [
    "double extension",
    {
      category: "other",
      mimeType: "application/pdf",
      sizeBytes: 10,
      fileName: "note.pdf.exe",
    },
  ],
  [
    "extension/type mismatch",
    {
      category: "labResult",
      mimeType: "application/pdf",
      sizeBytes: 10,
      fileName: "scan.png",
    },
  ],
  [
    "zero-byte file",
    { category: "other", mimeType: "application/pdf", sizeBytes: 0 },
  ],
  [
    "oversized file",
    {
      category: "other",
      mimeType: "application/pdf",
      sizeBytes: MAX_DOCUMENT_BYTES + 1,
    },
  ],
  [
    "unknown category",
    { category: "malware", mimeType: "application/pdf", sizeBytes: 10 },
  ],
])("upload validation bypass attempt rejected: %s", (_label, args) => {
  expect(() => validateUpload(args)).toThrow();
});

test("public download route returns 404 for garbage, replayed, and expired tokens", async () => {
  const tx = convexTest(schema, modules);
  const { staff, documentId } = await seedCleanDocument(tx);

  // Garbage and missing tokens: identical 404, no information leak.
  expect((await tx.fetch("/documents/download", {})).status).toBe(404);
  expect(
    (await tx.fetch("/documents/download?token=not-a-real-token", {})).status,
  ).toBe(404);

  // A valid link works once; the copied link is dead on replay.
  const path = await staff.mutation(api.domains.documents.createDownloadGrant, {
    documentId,
  });
  const first = await tx.fetch(path, {});
  expect(first.status).toBe(200);
  expect(first.headers.get("cache-control")).toBe("no-store");
  expect((await tx.fetch(path, {})).status).toBe(404);

  // An expired link is dead even though it was never used.
  const expiring = await staff.mutation(
    api.domains.documents.createDownloadGrant,
    { documentId },
  );
  await tx.run(async (ctx) => {
    const grants = await ctx.db.query("documentDownloadGrants").collect();
    const pending = grants.find((grant) => grant.consumedAt === undefined)!;
    await ctx.db.patch(pending._id, { expiresAt: 1 });
  });
  expect((await tx.fetch(expiring, {})).status).toBe(404);
});
