import { describe, expect, it } from "vitest";
import { headingId, parseBody } from "../../src/features/public/blog-post-page";

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
