import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Section } from "../../convex/lib/content";
import { headingId, parseBody } from "../../src/features/public/blog-post-page";
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
});

it("renders only allowlisted rich-text links", () => {
  const sections: Section[] = [
    {
      id: "links",
      type: "richText",
      text: "[Web](https://example.com) [Email](mailto:test@example.com) [Phone](tel:+15551234567) [Internal](/services) [Unsafe](javascript:alert(1))",
    },
  ];

  const html = renderToStaticMarkup(
    createElement("div", null, renderSections(sections)),
  );

  expect(html).toContain('<a href="https://example.com">Web</a>');
  expect(html).toContain('<a href="mailto:test@example.com">Email</a>');
  expect(html).toContain('<a href="tel:+15551234567">Phone</a>');
  expect(html).toContain('<a href="/services">Internal</a>');
  expect(html).not.toContain("javascript:");
  expect(html).toContain("Unsafe");
});
