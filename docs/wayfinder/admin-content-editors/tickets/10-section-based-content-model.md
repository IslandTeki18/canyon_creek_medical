---
title: Section-based content model
map: ../MAP.md
type: wayfinder:grilling
status: closed
closed: 2026-08-05
assignee: Landon McKell
blocked-by: []
---

## Question

Surfaced while working
[Partial drafts versus schema validation](02-partial-draft-validation.md).
The founder's intent for both blog posts and service pages:

> content will be an array of objects, each object a custom "section" decided
> by the user via click-to-add inputs. A section could be text then an image,
> or an image, a text, and a list, or however the user wants each section of
> the blog. This gives creative power to the user. Services will be the EXACT
> same.

This is a block editor, not a form. It replaces the fixed-field content model
that the rest of this map was charted against, so it has to be decided before
the validation, wizard, and editor-pattern tickets can mean anything.

### What must be decided

- **The section catalogue.** Which section types exist at launch — text,
  image, list, quote, callout, steps, facts? A closed set the founder picks
  from, not an open one.
- **The section shape.** Each type carries its own fields, so `content`
  becomes a discriminated union array rather than one object. What is the
  common envelope (`{ id, type, ... }`) and what is per-type?
- **Ordering and editing.** How does the founder add, reorder, and delete
  sections? This is the interaction the whole editor is now built around.
- **The existing six service pages.** Their content is highly structured —
  `chips`, `tags`, `indications`, `steps`, `facts`, `safetyNote` — and the
  public page renders each in a bespoke layout (icon header, chip row, quick
  facts panel, numbered steps). Do those become section types so nothing is
  lost, or does the public page get simpler and the structure get dropped?
- **Public rendering.** A free-form section array means the public service and
  blog pages must render arbitrary section sequences. **This crosses the
  boundary this map declared out of scope.** Either the out-of-scope line
  moves or this model is scoped to blog posts only.
- **Fixed metadata versus sections.** The founder named title, created-at,
  updated-at, author and "a few other metadata items" as outside the section
  array. For service pages, which of slug, icon, sort order, summary and
  safety note stay fixed metadata rather than becoming sections?
- **Safety note.** `CLAUDE.md` requires public content to carry no PHI and
  service pages currently always carry a clinical safety note. If the safety
  note becomes an optional section, a founder can publish a clinical service
  page without one. Is that acceptable?

### What this invalidates

- The charting decision "keep every field, just lay it out better" no longer
  describes service pages.
- [Wizard step breakdown](03-wizard-step-breakdown.md) was framed around
  dividing 13 fixed fields into steps. A section builder is not a wizard.
- [Partial drafts versus schema validation](02-partial-draft-validation.md)
  now has to validate a union of section types, not one object shape.

## Answer

**Sections are a closed catalogue of designed blocks that the founder orders
freely inside the main article column. Page furniture stays fixed.**

Creative power is over _composition_, not over _visual treatment_. The founder
chooses which blocks appear, in what order, how many times — and every block
keeps the layout it was designed with. No founder can produce an off-brand
page, because there is no way to invent a new look.

### The envelope

`content.sections` is a discriminated union array. Every section shares:

```ts
{ id: string, type: SectionType, ...perTypeFields }
```

`id` is a stable client-generated key so reordering and React keys do not
depend on array position or content.

### The launch catalogue

| Type            | Renders as                                       | Replaces                  |
| --------------- | ------------------------------------------------ | ------------------------- |
| `richText`      | Paragraphs, `##` headings, `>` pull-quotes       | `howItWorks`; blog `body` |
| `numberedSteps` | The numbered "What to expect" list, clay circles | `steps`                   |
| `itemGrid`      | The auto-fill card grid with clay dots           | `indications`             |
| `calloutPanel`  | The rounded tinted panel                         | new                       |
| `image`         | Full-width banded image                          | the hero placeholder      |
| `bulletList`    | Plain bulleted list                              | new                       |

Closed set. Adding a type is a code change, deliberately — it is how the
design stays coherent.

### Fixed slots, not sections

The section array drives **only the main article column**. Everything else is
ordinary metadata the founder edits as fields:

- **Header:** `title`, `tags` (pills), `intro` (lede)
- **Hero:** the image band
- **Sidebar:** `facts` (quick facts), the two booking CTAs, related links
- **Index card:** `icon`, `summary`, `chips`, `sortOrder`, `slug`
- **Safety note:** `safetyNote`, rendered in its dedicated sage panel

This keeps every service page recognisably the same page.

### Safety note is required

`safetyNote` stays a **fixed field outside the section array** and the publish
gate rejects a service page without it. `CLAUDE.md` requires the clinical
safety language; making it an optional section would let a founder publish a
clinical page with none. Note the visual overlap with `calloutPanel` — the
safety panel is a distinct fixed slot with its own sage treatment, not an
instance of the general callout type.

### What this actually changes

Mapping the current 13 service-page fields:

- **Become sections (3):** `howItWorks` → `richText`, `indications` →
  `itemGrid`, `steps` → `numberedSteps`.
- **Stay fixed metadata (10):** `title`, `slug`, `icon`, `sortOrder`,
  `summary`, `chips`, `tags`, `intro`, `facts`, `safetyNote`.

Worth stating plainly: the section array replaces three of thirteen fields.
The gain is that the founder can now add, reorder, repeat and omit blocks in
the article column instead of filling three fixed slots in a fixed order. The
page's identity is untouched.

### Blog posts

Identical model. `body` becomes `content.sections`; `title`, `slug`,
`category`, `excerpt`, `authorName`, cover image and `publishedAt` stay fixed
metadata. The existing `parseBody` heading/quote/paragraph parser
(`src/features/public/blog-post-page.tsx:23`) becomes the internals of the
`richText` section, and the table of contents derives from headings across all
`richText` sections rather than one body string.

### Migration

A one-time script converts the six seeded service pages field-by-field into
their equivalent sections, preserving each page exactly. Safe because the
catalogue was chosen to cover every existing field. Blog posts convert by
running `parseBody` over `body` and emitting a single `richText` section.

### Scope consequence

The public service detail page and blog post page must now render an ordered
section list instead of fixed fields. **The map's "no public-site rendering
changes" boundary is formally withdrawn** — this is a rendering change to both
public templates, accepted as the cost of the section model.
