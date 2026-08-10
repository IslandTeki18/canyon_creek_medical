import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Section } from "../../convex/lib/content";
import { headingId, parseBody } from "../../src/features/public/blog-post-page";
import { getRichTextHeadings } from "../../src/features/public/rich-text";
import { renderSections } from "../../src/features/public/render-sections";

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
    ];

    expect(getRichTextHeadings(sections)).toEqual([
      { id: "care-options-services", level: 2, text: "Care options services" },
    ]);
  });
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
    '<div><p class="mt-0 mb-5 text-[17px] leading-[1.8] text-ink/85"><a href="http://example.com">HTTP</a> <a href="https://example.com/guides/(overview)">HTTPS</a> <a href="mailto:test@example.com">Email</a> <a href="tel:+15551234567">Phone</a> <a href="/services/(evaluation)">Internal</a> Unsafe</p></div>',
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
