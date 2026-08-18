import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function contentImageProblem(
  stored: { contentType?: string; size: number } | null,
): string | null {
  if (!stored) return "Image upload was not found";
  if (!ALLOWED_IMAGE_TYPES.includes(stored.contentType as never)) {
    return "Image must be a JPEG, PNG, or WebP file";
  }
  if (stored.size > MAX_IMAGE_BYTES) return "Image must be 5 MB or smaller";
  return null;
}

type ImageContent = {
  coverImage?: { storageId?: string };
  sections?: { type?: string; storageId?: string }[];
};

export function collectImageIds(content?: ImageContent): string[] {
  return [
    content?.coverImage?.storageId,
    ...(content?.sections ?? [])
      .filter((section) => section.type === "image")
      .map((section) => section.storageId),
  ].filter((id): id is string => id !== undefined);
}

export async function releaseImages(
  ctx: MutationCtx,
  before: string[],
  after: string[],
) {
  const removed = [...new Set(before)].filter((id) => !after.includes(id));
  if (removed.length === 0) return;

  // ponytail: full scan is fine for two small tables; add reference rows if scale requires it.
  const rows = [
    ...(await ctx.db.query("servicePages").collect()),
    ...(await ctx.db.query("blogPosts").collect()),
  ];
  const referenced = new Set(
    rows.flatMap((row) => [
      ...collectImageIds(row.content),
      ...collectImageIds(row.draftContent),
    ]),
  );
  await Promise.all(
    removed
      .filter((id) => !referenced.has(id))
      .map((id) => ctx.storage.delete(id as Id<"_storage">)),
  );
}
