// Upload validation and safe naming for patient documents (Increment 11.2).
// Rules live here so the upload mutation, the review workflow, and tests all
// agree on what is acceptable.

export const DOCUMENT_CATEGORIES = [
  "identification",
  "insurance",
  "labResult",
  "outsideRecord",
  "consentScan",
  "imaging",
  "other",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/** Allowed content types and the single extension each may carry. */
export const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/tiff": "tif",
};

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024; // 20 MB

/** Download grants are short-lived and single-use. */
export const DOWNLOAD_GRANT_TTL_MS = 2 * 60 * 1000;

export function isDocumentCategory(value: string): value is DocumentCategory {
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Validates a proposed upload. Returns the canonical extension. Original
 * client file names are never trusted or stored — they routinely contain
 * patient names, and filenames must stay free of PHI.
 */
export function validateUpload(args: {
  category: string;
  mimeType: string;
  sizeBytes: number;
  fileName?: string;
}): string {
  if (!isDocumentCategory(args.category)) {
    throw new Error("Unsupported document category");
  }
  const extension = ALLOWED_TYPES[args.mimeType];
  if (!extension) throw new Error("Unsupported file type");
  if (args.fileName) {
    const claimed = args.fileName.split(".").pop()?.toLowerCase() ?? "";
    const matches =
      claimed === extension || (extension === "jpg" && claimed === "jpeg");
    if (!matches) throw new Error("File extension does not match its type");
  }
  if (args.sizeBytes <= 0 || args.sizeBytes > MAX_DOCUMENT_BYTES) {
    throw new Error("File exceeds the maximum allowed size");
  }
  return extension;
}

/** Non-PHI download name: category, document id, and version only. */
export function safeFileName(args: {
  category: string;
  documentId: string;
  version: number;
  extension: string;
}): string {
  return `${args.category}-${args.documentId}-v${args.version}.${args.extension}`;
}
