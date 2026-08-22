# Map: Founder-friendly admin content editors

Labels: `wayfinder:map`
Status: closed
Created: 2026-08-05
Closed: 2026-08-22

## Destination

A written implementation spec for reworking the four admin content editors
(service pages, blog posts, and form templates; the service catalog was ruled
out of scope) so a
non-technical founder can manage them confidently: each editor is its own
full page rather than a crammed side panel, content is composed from a closed
catalogue of designed sections, work is never lost because drafts autosave,
lists are shown as cards that mirror what the public sees, and no
`window.prompt` remains. The spec is handed off and built afterwards; this map
builds nothing.

## Notes

- Domain: admin content management for a clinical practice platform. Primary
  user is a non-technical founder — simplicity beats power at every fork.
- Consult on every session: `/grilling`, `/domain-modeling`. Use `/prototype`
  for the prototype tickets.
- Repo rules that constrain every decision (`CLAUDE.md`): authorization is
  server-side in Convex, audit events for sensitive writes, no PHI in public
  content, published form/template versions are immutable.
- Standing preference: fewest concepts the founder must hold in their head.
  If a field can be derived, derive it.
- **Scope shifted 2026-08-05, now settled.** Charting assumed the 13
  service-page fields stay a fixed form and only the layout changes. The
  founder instead wants content composed from sections, which
  [Section-based content model](tickets/10-section-based-content-model.md)
  resolved. Two consequences: the wizard idea was replaced by a section
  canvas, and the public-site rendering boundary was withdrawn.
- No issue tracker is configured for this repo, so tickets are markdown files
  in `tickets/` beside this map. Blocking is expressed in each ticket's
  front-matter `blocked-by` list.

## Decisions so far

<!-- one line per closed ticket -->

- [Draft autosave on published content](tickets/01-autosave-published-content.md)
  — The draft lives in a `draftContent` field on the same row; `content` is
  the published version and is written only at publish. One invariant, no
  branching on status: autosave always writes `draftContent`, and a page has
  unpublished changes exactly when it is set. Publish promotes, discard drops.
  A separate draft row was rejected because `getPublishedServicePage` looks up
  by slug with `.unique()`. Applies to blog posts identically.
- [Section-based content model](tickets/10-section-based-content-model.md)
  — Content becomes a `sections` discriminated-union array over a **closed**
  catalogue of six designed blocks (rich text, numbered steps, item grid,
  callout, image, bullet list). The founder controls composition and order,
  never visual treatment. Page furniture — header, hero, sidebar, index-card
  fields — stays fixed metadata, so only 3 of the 13 service-page fields
  actually become sections. `safetyNote` stays fixed and publish-required.
  Blog posts use the identical model. The six seeded pages migrate by script.
- [Section canvas interaction](tickets/03-wizard-step-breakdown.md)
  — [Prototype](https://claude.ai/code/artifact/040de530-bfbf-4ef8-8994-8321c73866f6)
  accepted as built. Add via a hover `+` between sections so placement is
  where you click; reorder by drag **and** arrow buttons, keeping keyboard
  access for free; delete immediately with a six-second undo toast rather than
  a confirm dialog; preview is a separate View-as-visitor action, not in-place
  public rendering. Fixed metadata lives in a sticky left rail, sections in
  the main column.
- [Card list treatment](tickets/04-card-list-treatment.md)
  — [Prototype](https://claude.ai/code/artifact/6dac8513-a75d-4c12-9b15-ceed54a336d9)
  accepted. Cards mirror the public ones plus a state badge; four states
  distinguished by shape as well as colour; Edit and one contextual action
  visible, everything destructive behind `•••`. Drag sets public order and the
  `sortOrder` number disappears — service pages only, since blog posts order
  by `publishedAt`. Plain language over CMS jargon ("Put on the website").
  Archived behind a toggle. Blog reuses the card with the cover image in place
  of the icon. Build must add keyboard Move earlier/later.
- [The shared editor pattern](tickets/07-shared-editor-pattern.md)
  — No React Hook Form: it was never a dependency and `form-renderer.tsx`
  already rejected it, autosave removes the submit event it is built around,
  and the autosave buffer needs controlled state anyway. Service pages and
  blog posts share a full editor shell; the catalog and form templates take
  primitives only. Native drag plus the already-decided explicit move buttons,
  no drag library. Everything extracted into `src/components/ui`.
  **`CLAUDE.md` must be corrected** — it documents a dependency the project
  does not have.
- [Partial drafts versus schema validation](tickets/02-partial-draft-validation.md)
  — One schema factory yields strict and loose modes from a single shape
  definition, so they cannot drift (zod v4 removed `deepPartial`, so
  `.partial()` alone cannot loosen nested arrays). Drafts are **structurally**
  validated on every autosave — unknown section types and stray fields are
  rejected, empty strings and empty arrays are not. Strict validation moves to
  publish and becomes the gate: Publish stays clickable and, when the draft is
  incomplete, lists every problem linked to the section that owns it. `content`
  becomes optional; admin lists display `draftContent ?? content`.
- [Previewing an unpublished draft](tickets/13-draft-preview.md)
  — Preview is an admin route rendering the public template with draft data,
  so no public query becomes draft-aware. It shows the draft only; the
  "what changed" need is served by the Live · edited badge and Discard edits.
  **No new query** — the existing gated `getServicePage` / `getPost` already
  return `draftContent`; what is required is deny tests and an entry in
  `tests/unit/data-exposure.test.ts`. The action flushes the pending autosave
  before navigating. Prerequisite: split both public page components into
  presentation plus a data wrapper.
- [Admin surface naming](tickets/09-service-catalog-treatment.md)
  — Clinical `services` and website `servicePages` get distinct admin labels
  ("Bookable services" versus "Website services"). Labels
  and headings only: no data change, and no link between the two records.
  Recorded on the catalog ticket, which was otherwise ruled out of scope.
- [Replacing the browser prompts](tickets/05-replacing-browser-prompts.md)
  — shadcn `dialog` + `alert-dialog` over the already-installed `radix-ui`, so
  no new dependency. The ticket's "four calls" was wrong: **seven**, once the
  two `confirm`s and the rich-text Link dialog are counted. Reasons stay
  **free text**, so `reason` keeps its `v.string()` validator and there is no
  server or schema change — a pure client swap. The catalog migration becomes
  two **named** action buttons ("Cancel those appointments" / "Keep them, stop
  new bookings"), never OK/Cancel, with the destructive one out of default
  focus. One `ReasonDialog` wrapper covers four sites; an imperative
  `useConfirm()` was rejected as re-implementing what Radix does declaratively.
- [What a rich text section can do](tickets/11-rich-text-editing-scope.md)
  — A `richText` section stays a **plain-text string**; a toolbar (Heading,
  Subheading, Quote, Bold, Italic, Link) inserts the markers so the founder
  never types them. Two heading levels, `_italic_` not `*italic*`. No new
  dependency, no `contenteditable`, no HTML: the renderer emits React nodes,
  so there is nothing to sanitise — except link URLs, which are scheme-
  allowlisted in the **renderer**. Blog keeps its TOC, now derived across all
  sections with page-wide id dedup; service pages get none. The accepted cost
  is that the founder sees `## What to expect` and relies on View as visitor
  for the rendered result.
- [Autosave frequency and audit noise](tickets/08-autosave-audit-noise.md)
  — Draft autosave produces **no audit event**; it stamps `draftUpdatedAt` /
  `draftUpdatedByUserId` on the row instead. It gets its own `saveDraft`
  mutation rather than a suppress-audit flag on the audited one, which leaves
  `updateServicePage` owning only slug and sortOrder. Necessary because the
  `content.` prefix maps to **notice** severity, so routing autosave through
  the existing mutation would drown that tier. Text edits debounce 1s with a
  10s hard flush; structural edits (add/delete/reorder, image, toggles) save
  immediately. The founder sees one muted "Saved 2 minutes ago" and nothing
  else. Failures show a plain-words banner, wait on the Convex client's
  reconnect replay (no hook-level backoff), and hold
  navigation via a conditioned, path-scoped `useBlocker` plus `beforeunload`,
  always with a "Leave anyway" escape; a schema rejection stops retrying
  because that is our bug, not theirs. New pages are **named first** in a
  dialog, so `createServicePage` now takes `{ title }` and writes
  `draftContent` with no `content`. Cost: only the latest draft editor is
  recoverable, and the stamps clear at publish.
- [Images inside sections](tickets/12-images-inside-sections.md)
  — One `{ storageId, alt }` shape for both the `image` section and the cover
  slot. **`blogPosts.imageStorageId` moves inside `content`** — as a top-level
  column, swapping a cover would change the live page instantly and break the
  draft invariant. The service hero becomes an optional image with today's
  coloured band as its fallback, so the six seeded pages need no art to keep
  working. Alt text is required with no decorative escape hatch; migration
  backfills `alt: ""` so nothing regresses and the next republish pays the
  debt. Upload follows the `documents.ts` three-step pattern, capability-
  discriminated because service pages use `config.manage` and blog uses
  `content.author`. Type/size validated server-side at confirm and again at
  publish; no SVG. `getUrl` per image, parallelised — no cache table. Orphans
  are released at publish, discard, and explicit remove, never by a sweep;
  abandoned-draft uploads leak, accepted.
- [What gets tested, and at which level](tickets/15-testing-strategy.md)
  — Hook tests cover autosave, domain tests own denial and publish gates, RTL
  covers canvas controls, and converter plus migration tests prove migration
  safety; authenticated-browser gaps are explicit.
- [Sections on the public templates](tickets/14-sections-on-the-service-template.md)
  — Public service and blog templates render the ordered section list through
  `src/features/public/render-sections.tsx`, with legacy content as fallback.
- [How other tools handle autosave on published content](tickets/06-research-autosave-prior-art.md)
  — Of WordPress, Ghost, Sanity, Contentful and Notion, none autosaves into a
  live public page: three fork the write to a draft copy, Ghost refuses to
  autosave published posts, and Notion has no publishing model at all. On
  Convex, an optimistic update cannot loop but can snap back over keystrokes
  unless fields are buffered locally, which this repo already does. React
  Router v8 drops only the pending debounce timer, not a fired mutation, so
  the guard is flush-on-unmount plus a path-scoped `useBlocker`.

## Closed questions

- **Admin navigation and information architecture:** accepted as full-page
  master/detail editors with Back; breadcrumbs are not required.
- **Form templates specifics:** resolved by ticket 07 with primitives and
  prompt replacement in the detail page.
- **Mobile and small-screen behavior:** accepted as future work.
- **Permissions:** accepted as last-write-wins on `draftContent`, per ticket
  08; no editing lock was introduced.

## Out of scope

- ~~Public-site rendering changes.~~ **Withdrawn 2026-08-05** by
  [Section-based content model](tickets/10-section-based-content-model.md).
  The public service detail page and blog post page must now render an ordered
  section list instead of fixed fields, so both templates are in scope. Their
  visual design is not being redesigned — the section types reproduce the
  existing treatments.
- **The service catalog rework.** Ruled out 2026-08-05 by
  [Service catalog is config, not content](tickets/09-service-catalog-treatment.md).
  It has no content model, its per-service dependency detail (appointment
  types, providers, reminders, forms, resource warnings) does not fit a card,
  and its writes cancel patient appointments — it wants more friction, not
  less. Replacing its browser prompts stays in scope via ticket 05. Service
  creation also stays in scheduling configuration.
- **The app-wide `window.prompt` sweep.** Ruled out 2026-08-05 by
  [Replacing the browser prompts](tickets/05-replacing-browser-prompts.md).
  Roughly **29** further `window.prompt` calls live in `features/patients`,
  `features/scheduling`, `features/clinical`, `features/communications`,
  `features/portal` and `reports-page.tsx`. Same smell, different destination —
  each has its own reason semantics. This effort ships the dialog primitive
  in `src/components/ui` so that sweep is later mechanical, and converts only
  the four content-editor files.
- ~~Reducing the service-page field set.~~ Withdrawn 2026-08-05. The section
  model supersedes the fixed field set entirely, so "keep all 13 fields" no
  longer describes the destination.

## Tickets

Frontier (open, unblocked):

_Nothing open._

_Nothing blocked._
