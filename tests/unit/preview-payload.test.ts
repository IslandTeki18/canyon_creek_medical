import { describe, expect, it } from "vitest";
import {
  toPostPreview,
  toServicePreview,
} from "../../src/features/administration/preview-payload";

describe("preview payloads", () => {
  it("uses service drafts and resolves their cover image", () => {
    const row = {
      slug: "therapy",
      sortOrder: 2,
      content: { title: "Live" },
      draftContent: {
        title: "Draft",
        coverImage: { storageId: "cover", alt: "Calm room" },
      },
      imageUrls: { cover: "https://example.test/cover" },
    } as Parameters<typeof toServicePreview>[0];

    expect(toServicePreview(row)).toMatchObject({
      content: { title: "Draft" },
      coverImage: {
        url: "https://example.test/cover",
        alt: "Calm room",
      },
    });
  });

  it("flattens post drafts and derives their legacy body", () => {
    const row = {
      slug: "draft-post",
      publishedAt: 123,
      draftContent: {
        title: "Draft",
        category: "Practice news",
        excerpt: "Excerpt",
        authorName: "Author",
        sections: [
          { id: "one", type: "richText", text: "First" },
          { id: "two", type: "richText", text: "Second" },
        ],
      },
      imageUrls: {},
    } as Parameters<typeof toPostPreview>[0];

    expect(toPostPreview(row)).toMatchObject({
      title: "Draft",
      body: "First\n\nSecond",
      publishedAt: 123,
      coverImage: null,
    });
  });
});
