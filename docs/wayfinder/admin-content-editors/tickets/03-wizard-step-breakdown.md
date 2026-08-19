---
title: Section canvas interaction
map: ../MAP.md
type: wayfinder:prototype
status: closed
closed: 2026-08-05
assignee: Landon McKell
blocked-by: []
---

> Rewritten 2026-08-05. This ticket was "Wizard step breakdown", framed around
> dividing 13 fixed fields into wizard steps.
> [Section-based content model](10-section-based-content-model.md) replaced
> that model: the article column is now a founder-composed section list, so
> there are no fixed fields to pre-assign to steps. The editor's central
> interaction is composing sections, and that is what this ticket now covers.

## Question

Prototype the editor page and react to it. The founder is non-technical and
this is the screen they will spend all their time on.

- **Adding a section.** What does the add affordance look like — a persistent
  menu, an inline "+" between existing sections, or an empty-state prompt?
  How are the six types presented so their purpose is obvious without jargon
  ("Numbered steps" versus "itemGrid")?
- **Reordering.** Drag handles, or up/down buttons? Drag is nicer and is the
  harder thing to make accessible; up/down is keyboard-native for free.
  Whichever is chosen must work without a mouse.
- **Deleting.** Is a delete confirmed, undoable, or both? Deleting a section
  the founder spent ten minutes writing is the most likely way to lose work,
  and autosave means it is gone from the draft immediately.
- **The fixed metadata.** Title, tags, intro, quick facts, safety note, and
  the index-card fields are not sections. Where do they live relative to the
  canvas — a panel beside it, a collapsed header, or a short first step before
  the canvas is reached?
- **Preview.** Does the founder see the section as it will look on the public
  page while editing, or is there a separate preview?
- **Empty and long states.** A brand new page with no sections, and a page
  with twenty.

Link the prototype from this ticket when it exists.

## Prototype

<https://claude.ai/code/artifact/040de530-bfbf-4ef8-8994-8321c73866f6>
Source: `scratchpad/section-canvas.html` (session scratchpad, not committed).
Interactive: add, drag-reorder, arrow-reorder, delete with undo. Uses the real
palette from `src/index.css`; display face is approximated because Caprasimo
cannot load under the artifact CSP.

## Answer

The prototype was accepted as built. Four decisions:

### Adding: hover `+` between sections

A `+` appears between every pair of sections on hover or focus, and inserts at
exactly that position — so placement is expressed by where you click rather
than by adding-then-moving. Chosen over a permanent "Add section" button.

The discoverability risk is real and accepted: a founder may not find a
control that is invisible until hovered. Mitigations already in the prototype
and required in the build — the empty state says "Use a + above to add the
first one", and the `+` is reachable and revealed by keyboard focus, not only
by mouse hover (`.gap:focus-within`).

### Reordering: drag handles _and_ arrow buttons

Both, on every section header. Drag is fast with a mouse; the up/down arrows
are keyboard-native and screen-reader friendly without extra work, and are
disabled at the ends of the list. Accessibility is on the never-simplify list,
so drag-only was rejected; arrows-only was rejected because moving a section
past ten others should not take ten clicks.

### Deleting: immediate, with an undo toast

No confirmation dialog. Deletion is immediate and a toast offers **Undo** for
roughly six seconds, restoring the section at its original index. Chosen over
confirm-on-delete (interrupts every deletion, including the empty section just
added by mistake) and over conditional confirmation (two behaviours the
founder cannot predict).

Note the interaction with autosave: the section leaves the draft immediately,
so the undo window is the only protection. The toast timeout is therefore a
real durability decision, not a cosmetic one.

### Preview: separate, on demand

The canvas shows editable fields, not public styling. A **View as visitor**
action opens the rendered page. Rejected: in-place rendering of each section
in its public styling, which would require an editable variant of every
section type's public layout — the largest cost in the whole editor for the
smallest fixed benefit.

### Layout confirmed

Fixed metadata sits in a sticky left rail grouped as **Page details**,
**Sidebar**, and **Required** (the safety note, visually distinct in sage);
the section canvas occupies the main column. Top bar carries back-navigation,
title, the published-with-unpublished-changes pill, autosave state, discard,
and publish. The rail collapses above the canvas below 900px.

### Surfaced

Previewing a draft means rendering unpublished content through the public
template — see [Previewing an unpublished draft](13-draft-preview.md).
