import type { ReactNode } from "react";
import type { Section } from "../../../convex/lib/content";

export type RichTextBlock =
  | { kind: "heading"; text: string }
  | { kind: "subheading"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "paragraph"; text: string };

export function headingId(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function parseBody(body: string): RichTextBlock[] {
  return body.split(/\n\s*\n/).map((block) => {
    const text = block.trim();
    if (text.startsWith("### ")) {
      return { kind: "subheading", text: text.slice(4).trim() };
    }
    if (text.startsWith("## ")) {
      return { kind: "heading", text: text.slice(3).trim() };
    }
    if (text.startsWith("> ")) {
      return { kind: "quote", text: text.replace(/^> ?/gm, "").trim() };
    }
    return { kind: "paragraph", text };
  });
}

function isAllowedHref(href: string) {
  if (
    href.startsWith("/") &&
    !href.startsWith("//") &&
    !href.startsWith("/\\")
  ) {
    return true;
  }

  try {
    return ["http:", "https:", "mailto:", "tel:"].includes(
      new URL(href).protocol,
    );
  } catch {
    return false;
  }
}

const INLINE_MARK = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|_([^_]+)_/g;

export function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(INLINE_MARK)) {
    const [full, label, href, bold, italic] = match;
    const index = match.index ?? 0;
    if (index > lastIndex) nodes.push(text.slice(lastIndex, index));
    if (label !== undefined && href !== undefined) {
      nodes.push(
        isAllowedHref(href) ? (
          <a key={index} href={href}>
            {label}
          </a>
        ) : (
          label
        ),
      );
    } else if (bold !== undefined) {
      nodes.push(<strong key={index}>{bold}</strong>);
    } else if (italic !== undefined) {
      nodes.push(<em key={index}>{italic}</em>);
    }
    lastIndex = index + full.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function createHeadingIds() {
  const counts = new Map<string, number>();
  return (text: string) => {
    const id = headingId(text);
    const count = (counts.get(id) ?? 0) + 1;
    counts.set(id, count);
    return count === 1 ? id : `${id}-${count}`;
  };
}

export function getRichTextHeadings(sections: readonly Section[]) {
  const nextId = createHeadingIds();
  return sections.flatMap((section) =>
    section.type !== "richText"
      ? []
      : parseBody(section.text).flatMap((block) =>
          block.kind === "heading" || block.kind === "subheading"
            ? [
                {
                  id: nextId(block.text),
                  level: block.kind === "heading" ? 2 : 3,
                  text: block.text,
                },
              ]
            : [],
        ),
  );
}
