---
title: Previewing an unpublished draft
map: ../MAP.md
type: wayfinder:grilling
status: closed
closed: 2026-08-05
assignee: Landon McKell
blocked-by: []
---

## Question

Surfaced by [Section canvas interaction](03-wizard-step-breakdown.md), which
settled that preview is a separate **View as visitor** action rather than
in-place rendering.

That action has to render `draftContent` through the _public_ template, and
the public queries deliberately return published rows only —
`getPublishedServicePage` filters on `status === "published"` and
`listPublishedServicePages` uses the `by_status` index
(`convex/domains/content.ts:167-191`).

- Where does preview render? A route under `/admin` that reuses the public
  template component, or the real public route with a preview parameter?
- What serves the data? A capability-gated `previewServicePage` query is the
  obvious answer, and it must **not** be reachable without `config.manage` —
  authorization is server-side, and this is a deny-path test.
- The public queries currently call `ctx.auth.getUserIdentity()` and return
  content to anyone. A preview query must not be a way to read unpublished
  marketing copy anonymously. Confirm the capability check and write the
  denial test.
- Does preview show the draft, the live version, or offer a comparison of the
  two? Prior art from
  [How other tools handle autosave on published content](06-research-autosave-prior-art.md)
  suggests founders want to see what changed, not just what it looks like.
- Does the same preview mechanism serve blog posts?
- Does preview open in a new tab, and does leaving the editor to preview
  interact badly with autosave flush-on-unmount?

## Answer

### An admin route reusing the public template

Preview lives under `/admin`, e.g. `/admin/service-pages/:id/preview`,
rendering the same presentational component the public page uses, fed draft
data. The public routes and their published-only queries stay untouched — no
public code path ever becomes draft-aware, which is the cheapest way to
guarantee a draft cannot leak to a visitor.

**Implication for the spec:** `service-detail-page.tsx` and
`blog-post-page.tsx` currently fetch their own data with `useQuery`. Each must
be split into a presentational component taking content as props plus a thin
data wrapper, so the preview route can render the same presentation with
different data. That refactor is a prerequisite, not an optional tidy-up.

### The draft only

Preview renders `draftContent` as the page would look if published. No live/
draft toggle and no side-by-side diff. The research noted founders often want
to know _what changed_; that need is met more cheaply by the
**Live · edited** state badge and the **Discard edits** action already decided
in [Card list treatment](04-card-list-treatment.md), without building a diff
view over full-width sections.

### No new query — reuse the existing admin getters

The gating requirement is satisfied by what already exists:

- `getServicePage` (`convex/domains/content.ts:159-165`) calls
  `requireCapability(ctx, "config.manage")` and returns the whole row,
  including `draftContent`.
- `getPost` (`convex/domains/blog.ts:251-257`) does the same behind
  `content.author`.

Adding a `previewServicePage` query would duplicate an existing gated read and
create a second surface to keep secure. The preview route reads the admin
getter it already has.

**Still required, because the gate is only as good as its tests:**

- A deny-path test per getter asserting that an unauthenticated caller _and_
  an authenticated caller without the capability are both rejected.
- An entry in `tests/unit/data-exposure.test.ts`, which exists precisely to
  pin reviewed exposure boundaries so a later change cannot silently reopen
  one. Preview is a new way to read unpublished content and belongs there.
- Note the capability asymmetry worth confirming during the build: service
  pages gate on `config.manage`, blog posts on `content.author`. Preview must
  not become a path that reads one behind the other's gate.

### Flush the pending autosave before opening

The **View as visitor** action awaits the pending debounced save before
navigating, using the flush-not-cancel guard from
[the research](06-research-autosave-prior-art.md) §3. The preview therefore
always reflects what is on screen. Rejected: opening immediately (shows stale
content and undermines trust in the preview) and letting a reactive
subscription catch up (correct eventually, but the founder sees the old
version first, which is the same trust problem).
