---
title: Rendering sections on the service template
map: ../MAP.md
type: wayfinder:grilling
status: closed
closed: 2026-08-09
assignee: Landon McKell
blocked-by: []
---

## Question

Graduated from the map's **Public section rendering** fog, which was held until
[Images inside sections](12-images-inside-sections.md) landed. It now has.

What is settled: `richText` is fully specified by
[What a rich text section can do](11-rich-text-editing-scope.md) — parser,
marker vocabulary, link allowlist, heading ids. The hero slot is settled by
[Images inside sections](12-images-inside-sections.md) — optional uploaded
image, coloured band as fallback.

What is still dim is the **other five section types on the service template**,
which is the harder of the two because it is not a single column. Today
`src/features/public/service-detail-page.tsx` renders a bespoke layout: icon
header, chip row, hero band, then
`grid-cols-[minmax(0,1fr)_320px]` — main article column plus a fixed sidebar
carrying quick facts and the booking CTAs. The section array drives only that
main column ([Section-based content model](10-section-based-content-model.md)),
so every section type has to survive being narrower than full width, appearing
any number of times, and appearing in any order.

- **`image` in a constrained column.** The hero is full-bleed above the grid.
  An `image` section sits inside a column that is `1fr` of a two-column grid.
  Does it stay in-column, or break out full-bleed the way the hero does — and
  if it breaks out, what happens to the sidebar flowing beside it?
- **Repetition and adjacency.** The existing layout assumes exactly one
  "How it works", one indications grid, one steps list, each with fixed
  `mb-11` spacing. Two `calloutPanel`s in a row, or an `image` directly
  followed by another `image`, are now expressible. What is the spacing rule
  when the founder produces sequences the current CSS never anticipated?
- **The sidebar's relationship to the section list.** Quick facts and CTAs are
  fixed metadata in a `320px` rail. If the founder writes twelve sections, the
  rail ends long before the article does. Does it stick, does it stop, or does
  the layout change?
- **Empty and single-section pages.** A page with one short `richText` section
  leaves the two-column grid mostly empty. Is there a minimum, or does it
  simply render short?
- **Does the blog template need any of this?** Blog is single-column, so the
  five types may drop in unchanged. Confirm rather than assume — the TOC
  derivation from [What a rich text section can do](11-rich-text-editing-scope.md)
  now has to coexist with non-`richText` sections between headings.
- **Small screens.** The grid collapses to one column below `lg`. The map lists
  mobile behaviour as separate fog for the _editor_; this is the public side of
  the same question and may resolve here.

## Answer

- Image sections stay in-column at full column width, rounded and height-capped.
- Sections use one uniform `gap-11`; no adjacency-specific spacing.
- The existing `lg:sticky lg:top-6` sidebar remains unchanged and ends with its content.
- Empty and single-section pages render naturally without a template minimum.
- Blog uses the shared renderer and derives its TOC across interleaved sections, with `###` entries indented.
- Below `lg`, the existing single-column collapse remains unchanged.
