---
title: The shared editor pattern
map: ../MAP.md
type: wayfinder:grilling
status: closed
closed: 2026-08-05
assignee: Landon McKell
blocked-by: []
---

## Question

Four editors are in scope and they currently share a copy-pasted shape: a
`useQuery` list, a pile of `useState` fields, a hand-rolled `inputClass`
string, and near-identical `TextField` / `TextArea` / row-group components
duplicated between service pages and blog posts.

Once the wizard steps and card list are settled:

- Is there one shared editor shell that all four content types configure, or
  does each page own its layout and merely share primitives?
- The repo standard is React Hook Form plus Zod, which neither of these pages
  uses today. Does the rework adopt it, and does that change the autosave
  wiring?
- Which primitives get extracted into `src/components/ui` — field, wizard
  shell, card, dialog?
- Form templates already has a list-plus-detail split. Does it adopt the new
  pattern or stay as it is?

An over-abstracted shell that fits none of the four is the failure mode to
argue against here.

## Answer

### No React Hook Form

`CLAUDE.md` lists "React Hook Form + Zod" in the stack, but **react-hook-form
has never been a dependency** — it is absent from `package.json`, and
`src/features/intake/form-renderer.tsx:3` carries a deliberate decision
against it:

> `ponytail:` controlled component matching the codebase's form idiom instead
> of adding react-hook-form; revisit if per-field validation UX outgrows it.

Autosave removes the submit event RHF is built around, and validation is
server-side at publish
([Partial drafts versus schema validation](02-partial-draft-validation.md)),
so the library would buy little while contradicting an existing decision and
splitting the codebase into two form idioms. Editors stay controlled
components with local `useState`, which is also what the autosave buffer
requires
([research](06-research-autosave-prior-art.md) §2).

**Action for the spec:** correct `CLAUDE.md`, which currently documents a
dependency the project does not have and has twice chosen not to add.

### Shared primitives, plus one shell for the two content editors

Service pages and blog posts now share the section model, the draft/publish
mechanic, and the card list, so they share a full **editor shell**: top bar
with save state and publish, sticky metadata rail, section canvas.

The service catalog and form templates take **primitives only**. The catalog
is operational config whose writes cancel patient appointments, and form
templates are immutable versioned records — neither has sections, drafts, or
a publish-promotes-draft mechanic. Forcing all four through one configurable
shell would bend it until it fit none of them.

### Native drag plus explicit move buttons

No drag-and-drop dependency. Native HTML5 drag events cover the mouse, as in
both prototypes; the explicit move controls already decided in
[Section canvas interaction](03-wizard-step-breakdown.md) and
[Card list treatment](04-card-list-treatment.md) cover keyboard and touch,
which is what native drag handles badly. The accessible path is a real
control, not a better drag library.

### Everything lands in `src/components/ui`

One place to look, alongside the existing `button.tsx`. Extracted: field
inputs (replacing the `inputClass` string duplicated across
`service-pages-page.tsx:8` and `blog-posts-page.tsx:16`), the dialog primitive
from [Replacing the browser prompts](05-replacing-browser-prompts.md), the
content card, the section canvas, and the editor shell.

Accepted tradeoff: `components/ui` will hold both generic primitives and
components only the content editors use. Revisit only if it becomes hard to
find things.

### Scale note

The four pages total 1,862 lines today, and the genuinely duplicated code is
smaller than this ticket assumed — `inputClass` is the only verbatim copy;
`TextField`, `TextArea`, `StringRows`, `Add` and `Remove` live solely in
`service-pages-page.tsx`. Extraction is therefore mostly about giving the new
shell a home, not about deduplicating a large existing mess.
