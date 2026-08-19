import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type {
  BlogPostContent,
  ServicePageContent,
} from "../../../convex/lib/content";

type ServiceRow = NonNullable<
  FunctionReturnType<typeof api.domains.content.getServicePage>
>;
type PostRow = NonNullable<FunctionReturnType<typeof api.domains.blog.getPost>>;

export function toServicePreview(row: ServiceRow) {
  const draft = (row.draftContent ?? row.content) as ServicePageContent;
  const { coverImage, ...content } = draft;
  return {
    slug: row.slug,
    sortOrder: row.sortOrder,
    content,
    coverImage: coverImage
      ? {
          url: row.imageUrls[coverImage.storageId] ?? null,
          alt: coverImage.alt,
        }
      : null,
    imageUrls: row.imageUrls,
  };
}

export function toPostPreview(row: PostRow) {
  const draft = (row.draftContent ?? row.content) as Omit<
    BlogPostContent,
    "sections"
  > & {
    sections?: BlogPostContent["sections"];
    body?: string;
  };
  const { title, category, excerpt, authorName, coverImage, sections, body } =
    draft;
  return {
    slug: row.slug,
    title,
    category,
    excerpt,
    authorName,
    sections,
    body:
      body ??
      (sections ?? [])
        .filter((section) => section.type === "richText")
        .map((section) => section.text)
        .join("\n\n"),
    publishedAt: row.publishedAt,
    coverImage: coverImage
      ? {
          url: row.imageUrls[coverImage.storageId] ?? null,
          alt: coverImage.alt,
        }
      : null,
    imageUrls: row.imageUrls,
  };
}
