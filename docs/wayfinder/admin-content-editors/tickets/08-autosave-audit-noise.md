---
title: Autosave frequency and audit noise
map: ../MAP.md
type: wayfinder:grilling
status: closed
closed: 2026-08-06
assignee: Landon McKell
blocked-by: []
---

## Question

`CLAUDE.md` requires audit events for sensitive writes. Autosave turns one
deliberate save into potentially dozens of writes per editing session, and a
naive implementation would bury the audit log under keystroke noise.

Once the autosave model is settled:

- What is the debounce interval, and does it also flush on blur, on step
  change, and on navigation away?
- Which autosave writes are auditable events? A defensible line is that draft
  autosaves are not audited but publish, unpublish, and archive are.
- Does the founder see save state, and in what words — "Saved", "Saving…", a
  timestamp, nothing?
- What happens when an autosave fails: silent retry, a visible banner, or
  blocking the founder from navigating until it succeeds.
- Does autosave write on the very first keystroke of a brand new page, and
  therefore create empty draft rows the founder abandoned?

## Answer

**Draft autosave is not an audited event — it is a row stamp. It gets its own
unaudited mutation, so the audited one keeps meaning something.**

### Why the noise problem is real

`severityForAction` maps the `content.` prefix to **notice**
(`convex/lib/audit.ts:24-32`) — one tier above routine. Routing autosave
through the existing `updateServicePage` would push dozens of notice-severity
rows per editing session into the audit search at
`src/features/administration/audit-page.tsx`, drowning the tier that exists to
be scannable.

### The line: stamp the row, don't audit it

Both tables gain two fields, written by autosave and nothing else:

```ts
draftUpdatedAt: v.optional(v.number()),
draftUpdatedByUserId: v.optional(v.id("users")),
```

Draft content is public marketing copy, carries no PHI, and is invisible to
anyone but staff until publish. It is not a sensitive write in the sense
`CLAUDE.md` means, so it produces **zero** audit rows. "Who last touched this
draft, and when" stays answerable from the row itself. Publish, unpublish,
discard and archive remain audited exactly as today — those are the moments
something becomes public or is destroyed.

**Accepted cost:** only the _latest_ draft editor is recoverable, not the
sequence of edits. And because the stamps are cleared at publish and discard
alongside `draftContent` (they describe a draft; with no draft they would be
stale), a page drafted by one person and published by another shows only the
publisher in the trail. Acceptable for a practice with one founder managing
content; if a second content editor is ever added, revisit.

### A separate mutation, not a flag

```ts
saveDraft({ id, draftContent }); // per content type
// - requires the same capability as the update mutation it sits beside
// - loose-schema validated per Partial drafts versus schema validation
// - patches draftContent + draftUpdatedAt + draftUpdatedByUserId
// - writes NO audit event
```

A boolean on `updateServicePage` that suppresses auditing was rejected: an
audited mutation with an off switch is the shape that eventually gets switched
off by accident. Two mutations, one of which never audits, cannot drift.

This leaves `updateServicePage` and `updatePost` responsible only for the
non-content columns — `slug`, `sortOrder` — which they keep auditing. Content
now moves exclusively through `saveDraft` (in) and `publish` (out).

**`updatedAt` is not touched by autosave.** Otherwise "last modified" would
mean "last keystroke". `updatedAt` keeps meaning "the published record or its
status changed"; `draftUpdatedAt` means "someone was typing".

### Timing: structural edits are immediate, text debounces

| Trigger                                  | Behaviour                  |
| ---------------------------------------- | -------------------------- |
| Typing in any text field                 | 1s idle debounce           |
| Continuous typing with no pause          | hard flush every 10s       |
| Add / delete / reorder a section         | **immediate**, no debounce |
| Metadata select, toggle, image confirmed | **immediate**              |
| Field blur                               | flush                      |
| Navigation away / unmount                | flush, never cancel        |

Structural edits are discrete intentional acts with nothing to coalesce, and
they are exactly the edits whose loss would be most alarming — a deleted
section that comes back is worse than a lost half-sentence.

Only one autosave is in flight at a time; edits arriving during a write queue
**one** trailing save rather than stacking.

The ticket's "does it flush on step change" is moot: the wizard was replaced by
a canvas in [Section canvas interaction](03-wizard-step-breakdown.md), so there
are no steps.

Flush-on-unmount rather than cancel-on-unmount is
[the research ticket's](06-research-autosave-prior-art.md) finding — React
Router v8 drops only the pending timer, not a fired mutation.

### What the founder sees: as little as possible

A single muted line in the editor header. Nothing else.

```
Ketamine therapy                            Saved 2 minutes ago
```

`Saving…` replaces it briefly during a write. There is no persistent tick and
no "Unsaved changes" state — a label that flickers on every keystroke reads as
alarm, not reassurance, to the user this map is built for. The relative
timestamp re-renders on a 30s interval while the editor is mounted.

### Failure: say so plainly, keep trying, hold the door

**Built as:** The Convex client replays queued mutations after reconnect, so
there is no hook-level backoff ladder. The five-second "still trying" banner
is the transient state; the error banner is reserved for server rejection.

Two failure kinds, and they are not the same problem:

**Transient (network, server unavailable).** Retry on backoff — 2s, 4s, 8s,
capped at 30s — indefinitely while the editor is mounted. A persistent banner
appears immediately in plain words:

> Your changes aren't saving right now. We're still trying — please keep this
> page open.

**Rejection (the loose schema refuses the draft).** Stop retrying: a
structurally invalid draft produced by our own editor is a bug, and retrying it
forever just hides that. The banner says so and offers to copy the page's text
so nothing is trapped.

While there are unflushed changes **or** the last save failed, `useBlocker`
prevents navigation away, with an explicit escape ("Leave anyway — your recent
changes will be lost") so a founder is never trapped by a failure they cannot
fix. Two constraints from the research ticket:

- The blocker is **conditioned and path-scoped**, never `useBlocker(true)` —
  the naive form blocks every subsequent navigation.
- `useBlocker` does not catch hard reloads or tab close, so a `beforeunload`
  listener is registered while dirty. Native, one line, no library.

### New pages: name it first

Clicking **New service page** opens a small dialog (the `dialog` primitive from
[Replacing the browser prompts](05-replacing-browser-prompts.md), so no new
machinery) asking only for the title, with the derived slug shown beneath it:

```
New service page
────────────────
What is this page called?
[ Ketamine therapy        ]
canyoncreek.com/services/ketamine-therapy

        [Cancel]  [Create]
```

The row is created there, then the editor opens and autosaves from the first
keystroke. Every row has a real identity from birth, so an abandoned one is a
recognisable card the founder can find and delete rather than an "Untitled"
mystery — and, per [Images inside sections](12-images-inside-sections.md), a
findable abandoned page is a deletable one, which is the only handle on its
leaked uploads. Slug collisions surface in the dialog rather than after the
editor is already open.

Accepted cost: one gate between intent and typing.

**This changes the create mutations.** `createServicePage` takes `{ title }`,
derives the slug, appends `sortOrder` at the end (the visible number was
removed by [Card list treatment](04-card-list-treatment.md)), and writes
`draftContent: { title }` with **no `content`** — a never-published page has no
published version, so the strict `parseServicePageContent` call at
`convex/domains/content.ts:28` moves to publish. Creation stays audited: it is
a deliberate act, not autosave. `createPost` changes identically.

### Left open

No locking was introduced, so two people editing one page is **last-write-wins
on `draftContent`**. That is the map's remaining _Permissions_ fog, and this
decision sets its default rather than resolving it.
