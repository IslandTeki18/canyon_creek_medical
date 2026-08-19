---
title: Card list treatment
map: ../MAP.md
type: wayfinder:prototype
status: closed
closed: 2026-08-05
assignee: Landon McKell
blocked-by: []
---

## Question

Cards mirroring the public site are decided over the current five-column
table. Prototype two or three treatments and react to them:

- What appears on a card — icon, title, summary, status badge, last-edited
  timestamp? The public services page shows icon, title, summary and chips.
- How is status shown so draft versus published versus archived is obvious at
  a glance without reading text?
- Where do the actions live: edit, publish, unpublish, archive. On the card,
  behind a menu, or only inside the editor?
- The numeric `sortOrder` field controls public ordering. Do the cards render
  in that order, and can the founder change it here?
- Archived pages are currently listed with no actions. Are they shown at all,
  or filtered behind a toggle?
- Does the same card work for blog posts, which have cover images?

Link the prototype from this ticket when it exists.

## Prototype

<https://claude.ai/code/artifact/6dac8513-a75d-4c12-9b15-ceed54a336d9>
Source: `scratchpad/service-cards.html` (session scratchpad, not committed).
Interactive: state badges, `•••` menus, drag reorder, archived toggle.

## Answer

Accepted as built, with one required correction (keyboard reordering, below).

### The card mirrors the public one

Icon circle, title, summary, chip row — the same furniture as
`services-page.tsx:87-121` — plus a state badge and an action row. The founder
recognises the card because it is what visitors see.

### Four states, distinguished by shape as well as colour

| State                         | Badge             | Mark                   |
| ----------------------------- | ----------------- | ---------------------- |
| Published, clean              | **Live**          | filled sage dot        |
| Published, `draftContent` set | **Live · edited** | clay square            |
| Draft                         | **Draft**         | hollow dashed ring     |
| Archived                      | **Archived**      | faded dot, card dimmed |

Colour is never the only signal — the mark's shape and the border style carry
it too, so the states survive a colour-blind reader and a greyscale print.

### Actions

`Edit` always, plus one contextual primary (`Put on the website` for a draft,
`Publish edits` when there are unpublished changes). Everything else lives
behind `•••`: view as visitor, discard edits, take off the website, restore,
and archive. Destructive actions are never one stray click away.

### Ordering: drag, and the number disappears

Dragging a card sets public ordering; `sortOrder` is written behind the scenes
and the founder never sees the number. One less concept, and consistent with
the section canvas.

**Correction required in the build:** the prototype offers drag only, which is
not keyboard-accessible. Accessibility is on the never-simplify list, and the
section canvas already set the precedent of pairing drag with explicit
controls. The `•••` menu must therefore also carry **Move earlier** / **Move
later**. This was a gap in the prototype, not a decision to keep it.

**Scope note:** manual ordering applies to **service pages only**. `blogPosts`
has no `sortOrder` and is ordered by `publishedAt` via the
`by_status_published` index, so blog cards are not drag-orderable and must not
show a grip.

**Feeds [Autosave frequency and audit noise](08-autosave-audit-noise.md):** a
reorder rewrites `sortOrder` on several rows at once. Whether that is one
audit event or many needs an answer there.

### Wording: plain language, not publishing jargon

`Put on the website`, `Take off the website`, `Live`, `Live · edited` — chosen
over Publish / Unpublish / Published / Draft because the founder does not
think in CMS terms. Note the deliberate split: audit actions keep their
technical names (`content.servicePage.published`), so the words in the log and
the words on screen differ by design.

### Archived

Hidden behind a **Show archived** toggle. Archived cards are dimmed, cannot be
dragged, and offer only **Restore**. Archiving still requires a typed reason —
which [Replacing the browser prompts](05-replacing-browser-prompts.md) turns
into a real dialog.

### Blog posts

Same card component, with the cover image taking the place the icon circle
occupies on a service card. One component, one variant — not a second card
design mirroring the public blog index.

## Added by ticket 01

There are now **four** states to show, not three:
draft, published, **published with unpublished changes**, archived. The card
also carries a **discard changes** action for that fourth state. Design the
badge and that action alongside the rest of the card rather than bolting them
on afterwards.
