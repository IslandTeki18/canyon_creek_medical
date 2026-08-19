---
title: What a rich text section can do
map: ../MAP.md
type: wayfinder:grilling
status: closed
closed: 2026-08-05
assignee: Landon McKell
blocked-by: []
---

## Question

Surfaced by [Section-based content model](10-section-based-content-model.md).
`richText` is the workhorse section and its editing affordance is undecided.

Today the blog stores plain text and `parseBody`
(`src/features/public/blog-post-page.tsx:23`) recognises exactly two markers:
`## ` for a heading and `> ` for a pull-quote. A founder must type those
markers by hand, which is precisely the kind of technical detail this effort
exists to remove.

- What can a `richText` section contain — paragraphs, headings, bold, italic,
  links, inline lists? Each addition is a rendering surface and a sanitisation
  concern.
- How is it edited: a plain textarea keeping the `## ` and `> ` convention, a
  toolbar over a contenteditable, or a small set of typed sub-blocks the
  founder adds explicitly?
- If a real rich-text editor is wanted, that means a new dependency. Which,
  and is the storage format still plain text, HTML, or a JSON document?
- The public site renders whatever this produces. Arbitrary HTML from an
  editor is an injection surface — what is sanitised, and where?
- Headings feed the blog table of contents. Does that survive, and do service
  pages get one too?

Prefer the answer that requires no new dependency if it is not clearly worse.

## Answer

**A `richText` section stays a plain-text string. The founder never types a
marker, because a toolbar inserts them; the founder can still see and fix
them, because the text is right there.** No new dependency, no
`contenteditable`, no HTML anywhere in the pipeline.

### What the section contains

`{ id, type: "richText", text: string }` — a single string, blank-line
separated into blocks exactly as `parseBody`
(`src/features/public/blog-post-page.tsx:23`) already does.

Block markers, all at the start of a block:

| Marker   | Renders as |
| -------- | ---------- |
| `## `    | `h2`       |
| `### `   | `h3`       |
| `> `     | pull-quote |
| _(none)_ | paragraph  |

Inline marks, anywhere in a paragraph, heading or quote:

| Marker        | Renders as |
| ------------- | ---------- |
| `**bold**`    | `<strong>` |
| `_italic_`    | `<em>`     |
| `[text](url)` | `<a>`      |

Italic uses `_x_`, **not** `*x*`. Sharing the asterisk with bold is the classic
markdown ambiguity (`***x***`, `a*b*c`) and buys nothing here — the founder
types neither marker by hand.

### How it is edited

A textarea with a small toolbar above it: **Heading**, **Subheading**,
**Quote**, **Bold**, **Italic**, **Link**. Each button wraps the current
selection or inserts at the caret and restores focus with the selection
placed inside the inserted marks. The block buttons act on the block the caret
sits in, toggling the prefix rather than stacking it.

This is the accepted cost: the founder sees `## What to expect` rather than a
rendered heading. It buys a storage format that is inspectable, diffable,
migration-free, and impossible to inject through — and it keeps the editor to
one textarea and six buttons instead of an editor framework. **View as
visitor** ([Previewing an unpublished draft](13-draft-preview.md)) is where
the founder sees the rendered result.

The Link button prompts for a URL — via the shared input dialog from
[Replacing the browser prompts](05-replacing-browser-prompts.md), not
`window.prompt`.

### Storage and rendering: no HTML, ever

Storage is the plain string. The renderer parses to **React nodes** — the
inline parser emits `<strong>`, `<em>`, `<a>` elements directly. There is no
HTML string, therefore no `dangerouslySetInnerHTML`, therefore nothing to
sanitise and no sanitiser dependency.

One residual injection surface: link URLs. `[x](javascript:…)` is a live XSS
vector even without HTML. **Link `href`s are allowlisted by scheme** —
`http:`, `https:`, `mailto:`, `tel:`, and site-relative paths beginning `/`.
Anything else renders as plain text, not a link. The check lives in the
renderer, not in the editor, so a URL pasted straight into the textarea or
seeded by a migration cannot slip past it. This gets a unit test.

### Headings and the table of contents

- Blog posts keep their TOC. It now derives from headings across **all**
  `richText` sections rather than one `body` string, indented for `###`.
- **Service pages get no TOC.** Their sidebar already carries quick facts,
  two booking CTAs and related links; a fourth element that appears and
  disappears as a side effect of the founder's heading choices is worse than
  no TOC at all.
- `headingId` and heading anchors are unchanged. Because headings now come
  from several sections, ids must be **deduplicated across the whole page**
  (suffix `-2`, `-3`) — two sections can legitimately both contain
  `## What to expect`, and duplicate ids break both the anchor and a11y.
- A `###` with no `##` before it in the page skips a heading level. The
  publish gate from
  [Partial drafts versus schema validation](02-partial-draft-validation.md)
  already lists problems linked to the owning section, so this becomes one
  more entry on that list. It is a warning, not a block: the founder is
  building a page, not fighting a linter.

### Where the code goes

`parseBody`, the new inline parser, `headingId` and the scheme allowlist move
out of `blog-post-page.tsx` into a shared module, because the public service
page now renders `richText` too. The blog's existing `body` migration
([Section-based content model](10-section-based-content-model.md)) is
unaffected — the marker vocabulary is a superset of what it already parses, so
old bodies parse identically.

### What was rejected

- **contenteditable / Tiptap / Lexical.** A dependency, plus a sanitiser, plus
  an HTML or JSON storage format that later migrations must understand. The
  fidelity gain is real but is largely served by View as visitor.
- **Typed sub-blocks** (`{paragraph|heading|quote}[]` inside the section).
  Removes syntax entirely, but adds a second nesting level inside a section
  and makes ordinary prose a clicking exercise. The section canvas is already
  the composition surface; nesting a second one inside it doubles the concepts
  the founder holds.
- **No inline marks.** Rejected as too thin: the founder cannot link to the
  intake form from body prose.
