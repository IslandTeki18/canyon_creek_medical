import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useQuery } from "convex/react";
import type { Section } from "../../convex/lib/content";
import { headingId, parseBody } from "../../src/features/public/blog-post-page";
import { getRichTextHeadings } from "../../src/features/public/rich-text";
import { renderSections } from "../../src/features/public/render-sections";
import BlogPostPage from "../../src/features/public/blog-post-page";
import ServiceDetailPage from "../../src/features/public/service-detail-page";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));
vi.mock("react-router", () => ({
  Link: ({ children, ...props }: { children: unknown }) =>
    createElement("a", props, children),
  useParams: () => ({ slug: "synthetic-service" }),
}));
vi.mock("../../src/features/public/marketing-chrome", () => ({
  CTA_PRIMARY: "cta-primary",
  MarketingPage: ({ children }: { children: unknown }) =>
    createElement("div", null, children),
  WRAP: "wrap",
}));

describe("parseBody", () => {
  it("splits blocks into headings, quotes and paragraphs", () => {
    expect(
      parseBody(
        "Intro paragraph.\n\n## First section\n\n> A pull quote\n> over two lines\n\nBody text.",
      ),
    ).toEqual([
      { kind: "paragraph", text: "Intro paragraph." },
      { kind: "heading", text: "First section" },
      { kind: "quote", text: "A pull quote\nover two lines" },
      { kind: "paragraph", text: "Body text." },
    ]);
  });

  it("treats plain text as a single paragraph", () => {
    expect(parseBody("Just text")).toEqual([
      { kind: "paragraph", text: "Just text" },
    ]);
  });
});

describe("headingId", () => {
  it("slugifies heading text", () => {
    expect(headingId("What an evaluation looks at!")).toBe(
      "what-an-evaluation-looks-at",
    );
  });

  it("uses displayed heading text for IDs and TOC labels", () => {
    const sections: Section[] = [
      {
        id: "heading",
        type: "richText",
        text: "## **Care** _options_ [services](/services/(evaluation))",
      },
      { id: "image", type: "image", storageId: "storage-id", alt: "" },
      { id: "callout", type: "calloutPanel", title: "", body: "" },
      { id: "steps", type: "numberedSteps", steps: [] },
      { id: "items", type: "itemGrid", items: [] },
      { id: "bullets", type: "bulletList", items: [] },
      { id: "later-heading", type: "richText", text: "### Next steps" },
    ];

    expect(getRichTextHeadings(sections)).toEqual([
      { id: "care-options-services", level: 2, text: "Care options services" },
      { id: "next-steps", level: 3, text: "Next steps" },
    ]);
  });
});

it("stacks interleaved blog sections without flattening rich text", () => {
  vi.mocked(useQuery)
    .mockReturnValueOnce({
      slug: "synthetic-post",
      title: "Synthetic post",
      category: "Mental health",
      excerpt: "Excerpt",
      authorName: "Author",
      body: "Body",
      sections: [
        {
          id: "intro",
          type: "richText",
          text: "Opening.\n\n## First heading\n\nDetails.",
        },
        {
          id: "image",
          type: "image",
          storageId: "storage-id",
          alt: "A calm treatment room",
        },
        {
          id: "steps",
          type: "numberedSteps",
          steps: [{ title: "Step", body: "Step details" }],
        },
        {
          id: "callout",
          type: "calloutPanel",
          title: "Before you begin",
          body: "Bring your questions.",
        },
        { id: "items", type: "itemGrid", items: ["Item"] },
        { id: "bullets", type: "bulletList", items: ["Bullet"] },
        {
          id: "closing",
          type: "richText",
          text: "### Closing details\n\nThe end.",
        },
      ],
      imageUrl: null,
      imageUrls: { "storage-id": "https://example.com/room.jpg" },
    } as never)
    .mockReturnValueOnce([] as never);

  const html = renderToStaticMarkup(createElement(BlogPostPage));

  expect(html).toContain('class="flex max-w-[68ch] flex-col gap-11"');
  expect(html).toContain(
    '<article class="flex max-w-[68ch] flex-col gap-11"><section><p',
  );
  expect(html).toContain('src="https://example.com/room.jpg"');
  expect(html).toContain('alt="A calm treatment room"');
  expect(html).toContain("Step details");
  expect(html).toContain("Before you begin");
  expect(html).toContain("Item");
  expect(html).toContain("Bullet");

  const toc = html.slice(html.indexOf("In this article"));
  expect(toc.indexOf('href="#first-heading"')).toBeLessThan(
    toc.indexOf('href="#closing-details"'),
  );
  expect(toc).toContain('class="pl-4 text-sm');
});

it("renders only allowlisted rich-text links", () => {
  const sections: Section[] = [
    {
      id: "links",
      type: "richText",
      text: "[HTTP](http://example.com) [HTTPS](https://example.com/guides/(overview)) [Email](mailto:test@example.com) [Phone](tel:+15551234567) [Internal](/services/(evaluation)) [Unsafe](javascript:alert(1))",
    },
  ];

  const html = renderToStaticMarkup(
    createElement("div", null, renderSections(sections)),
  );

  expect(html).toBe(
    '<div><section><p class="mt-0 mb-5 text-[17px] leading-[1.8] text-ink/85"><a href="http://example.com">HTTP</a> <a href="https://example.com/guides/(overview)">HTTPS</a> <a href="mailto:test@example.com">Email</a> <a href="tel:+15551234567">Phone</a> <a href="/services/(evaluation)">Internal</a> Unsafe</p></section></div>',
  );
});

it("renders callouts, bullet lists, and resolved section images", () => {
  const sections: Section[] = [
    {
      id: "callout",
      type: "calloutPanel",
      title: "Before you begin",
      body: "Bring your questions.",
    },
    { id: "bullets", type: "bulletList", items: ["First", "Second"] },
    {
      id: "image",
      type: "image",
      storageId: "storage-id",
      alt: "A calm treatment room",
    },
  ];

  const html = renderToStaticMarkup(
    createElement(
      "div",
      null,
      renderSections(sections, "blog", {
        "storage-id": "https://example.com/treatment-room.jpg",
      }),
    ),
  );

  expect(html).toContain("Before you begin");
  expect(html).toContain("<ul");
  expect(html).toContain("<li>First</li>");
  expect(html).toContain('src="https://example.com/treatment-room.jpg"');
  expect(html).toContain('alt="A calm treatment room"');
  expect(html).toContain('loading="lazy"');
});

it("stacks a long service page without per-section margins", () => {
  const sections: Section[] = Array.from({ length: 20 }, (_, index) => ({
    id: `section-${index}`,
    type: "richText",
    text: `Section ${index}`,
  }));
  vi.mocked(useQuery).mockReturnValue({
    content: {
      title: "Synthetic service",
      icon: "leaf",
      summary: "Summary",
      chips: [],
      tags: [],
      intro: "Intro",
      sections,
      facts: [],
      safetyNote: "Safety note",
    },
    imageUrls: {},
  } as never);

  const html = renderToStaticMarkup(createElement(ServiceDetailPage));

  expect(html).toContain('class="flex flex-col gap-11"');
  expect(html).toContain("grid-cols-1");
  expect(html).toContain("lg:sticky lg:top-6");
  expect(html).not.toContain('class="mb-11"');
  expect((html.match(/How it works/g) ?? []).length).toBe(20);
});
