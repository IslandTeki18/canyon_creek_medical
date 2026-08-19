---
title: Draft autosave on published content
map: ../MAP.md
type: wayfinder:grilling
status: closed
closed: 2026-08-05
assignee: Landon McKell

blocked-by: []
---

## Question

Autosave-as-draft is decided, but it collides with published content. Today
`updateServicePage` writes straight through and the editor warns "Changes to a
published page go live on save" — so autosaving a published page would push
half-typed sentences to the public website within seconds.

What is the model? Candidates to grill, not a menu to pick from:

- Editing a published page forks a draft revision; publishing promotes it.
  Costs a schema change and a second copy of content per page.
- Autosave applies only to pages in `draft` status; published pages keep
  explicit save. Founder then faces two different behaviors.
- Published pages become read-only until the founder clicks "edit", which
  unpublishes into a draft. Simple, but the page vanishes from the site mid-edit.

Resolving this fixes what the founder sees when they open a live service page
and start typing, and it determines whether `servicePages` and `blogPosts`
need a revision concept at all.

## Answer

**The draft is a `draftContent` field on the same row. `content` is the
published version and is only ever written at publish time.**

### The invariant

One rule, no branching on status: **autosave always writes `draftContent`;
`content` changes only when the founder publishes.**

```
servicePages / blogPosts
  content:      the version the public sees. Written only by publish.
  draftContent: the working copy. Written by autosave. Admin-only.

publish  ->  content = draftContent;  draftContent = undefined
discard  ->  draftContent = undefined
```

A page has unpublished changes exactly when `draftContent !== undefined`.
That single predicate drives the badge, the discard action, and the publish
button's enabled state.

The alternative of writing `content` directly while a page is in `draft`
status was rejected: it makes autosave behave differently depending on
status, which is two code paths and two mental models for the founder.

### Why not a separate draft row

`getPublishedServicePage` (`convex/domains/content.ts:180-191`) looks up by
slug with `.unique()`, which **throws** if two rows share a slug. A
Sanity-style second row would break the public service detail page and force
a rework of the `by_slug` index and every query assuming one row per slug.
A separate revisions table was rejected as far more schema and code than the
problem needs; history is not a stated requirement.

This also matches the prior art from
[How other tools handle autosave on published content](06-research-autosave-prior-art.md):
Contentful's model is exactly this shape — draft fields carried on the entry
behind a `Changed` state.

### What the founder sees

- Status reads **Published, unpublished changes** wherever status is shown.
- A **discard changes** action drops `draftContent` and reverts to live.
  Cheap to offer precisely because the fork exists.
- The current warning "Changes to a published page go live on save" is
  deleted — it stops being true, which is the point.

### Consequences for other tickets

- **Schema:** `content` becomes optional on both tables, because a
  never-published page has no published version yet. Public queries only ever
  read `published` rows, which always have `content`, so no public code path
  can meet the undefined case.
- **Validation** — feeds
  [Partial drafts versus schema validation](02-partial-draft-validation.md):
  `content` stays strictly validated since only publish writes it;
  `draftContent` needs a loose schema. The strict parse becomes the publish
  gate, so "can this be published" is already answered by whether
  `parseServicePageContent(draftContent)` succeeds.
- **New mutations:** a discard mutation per content type, and `publish`
  changes from a status flip to a content promotion.
- **Unpublish** leaves `content` and any `draftContent` untouched and only
  flips status, so unpublishing never destroys work.
- **Audit** — feeds
  [Autosave frequency and audit noise](08-autosave-audit-noise.md): publish
  and discard are auditable; autosave writes to `draftContent` are the
  candidate for exemption.
- **Migration:** `draftContent` is a new optional field, so the six seeded
  service pages and any existing blog posts need no backfill.

### Scope

Applies identically to `servicePages` and `blogPosts` — one concept the
founder learns once.
