# Canyon Creek Health and Wellness — Design Guide

The site is built on the **Organic** design system. Every visual decision — color, type,
spacing, radius, shadow — comes from that system's tokens. This document records the
system itself plus the site-specific conventions layered on top of it.

---

## 1. Design system: Organic

Organic is warm, rounded and a little playful: a cream-and-sand ground with a terracotta
accent and a sage second accent, Caprasimo display headings over Figtree, 16px radii that
grow into pills and soft circular shapes. Photographs are washed so they sit back into the
warm page instead of on top of it.

### How to use it

- Link the one stylesheet from every page — `<link rel="stylesheet" href="styles.css">`
  (adjust the relative path) — and take every color, font, spacing, radius and shadow from
  its variables (`var(--color-*)`, `var(--font-*)`, `var(--space-*)`, `var(--radius-*)`,
  `var(--shadow-*)`). Never hard-code a hex, a font name or a px value the tokens already carry.
- Build with the system's classes rather than inventing parallel ones; the component pages
  are plain HTML, so view source and copy the markup.
- `templates/` holds starting points a consuming project can copy whole.
- The whole system was derived from `theme.json`. To change the look, edit the tokens at the
  top of `styles.css` — every page, the thumbnail and the guide read from them — and keep
  `theme.json` and the written guidance in step so they don't drift from what the CSS does.

### Direction

Left-aligned, asymmetric layouts. Flush-left headings; content hugs the left edge with
whitespace on the right. Lean into round shapes — over-rounded containers, pill buttons
(`border-radius: 999px`), soft circular accents. Wrap hero and inline images in the `.washed`
class — desaturated, lower-contrast and lifted, so they sit back into the page rather than
on top of it.

### Color

A light ground (`--color-bg` #f5ead8) with `--color-text` #201e1d and two accents —
`--color-accent` #c67139 and `--color-accent-2` #7a8a5e. Each role carries a 100–900 tonal
ramp (`--color-neutral-100` … `--color-accent-2-900`) generated in OKLCH on a shared
perceptual lightness scale, so the same step of any ramp has the same visual weight. Use the
light steps (100–300) for tinted fills, hovers and subtle borders, 500 as the role's base,
and the dark steps (700–900) for text on tinted fills and for pressed states; prefer ramp
steps over ad-hoc `color-mix()`. For elevation use `--shadow-sm/md/lg` (already tuned to the
ground) rather than ad-hoc box-shadows.

### Type

Caprasimo for headings over Figtree for body text, loaded as `--font-heading` / `--font-body`.
Density 1.10× and radius 16px are already baked into the `--space-*` / `--radius-*` scales —
use the variables, not raw numbers.

### Icons

Use Lucide icons (https://lucide.dev), at stroke-width 2.75 for a rounder, heavier look throughout.

### Interaction states

Interactive states are themed, never browser defaults: give every interactive element a
`:hover` tint and a pressed state from the accent ramp (one step past the base —
`--color-accent-600` on a light ground, `--color-accent-400` on a dark one, or a `color-mix()`
tint for outlined/ghost variants), and style keyboard focus with
`:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }` — never
leave the default blue focus ring.

### Components

| Class                                                                                    | What it is                                                                | Shown in                   |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------- |
| `.btn` with `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-icon`, `.btn-block`    | Actions — the primary is a solid accent fill                              | components/buttons.html    |
| `.tag` with `.tag-accent`, `.tag-accent-2`, `.tag-neutral`, `.tag-outline`               | Small labels tinted from the ramps                                        | components/buttons.html    |
| `.field` + `label`, `.input`, `.radio` + `.dot`, `.seg` + `.seg-opt`                     | Form fields and choices on native elements — no script                    | components/forms.html      |
| `.card` with `.card-kicker`, `.card-title`, `.card-body`, `.card-meta`; `.elev-sm/md/lg` | Surface-filled content cards; elevation utilities                         | components/cards.html      |
| `.nav` + `.nav-brand`                                                                    | The header bar                                                            | components/navigation.html |
| `.table`                                                                                 | Data tables with themed header and row rules                              | components/table.html      |
| `.dialog-backdrop` + `.dialog` (+ `.dialog-title/-body/-actions`)                        | A modal at the top elevation                                              | components/dialog.html     |
| `.hr`                                                                                    | A horizontal rule — present, but this system prefers whitespace; avoid it | —                          |
| `.washed`                                                                                | The image wrapper — every content photograph goes through it              | foundations/image.html     |

States are built in: hovers and pressed states come from the accent ramp, keyboard focus is
the 2px accent `:focus-visible` ring, `::selection` is an accent tint, and disabled controls
drop to 45% opacity. Don't restyle them per page. The accent-to-ground pair is tuned to at
least 3:1 — enough for icons, large text and interface chrome, not for body copy — so for
paragraph-size text in the accent use a deep ramp step (`--color-accent-700` on this ground)
rather than the accent itself.

### Do

- Over-round: `--radius-lg` for containers, `border-radius: 999px` for buttons and inputs.
- Use soft shapes — circles and blobs — as decoration and imagery masks.
- Reach for the sage `--color-accent-2-*` ramp as a genuine second voice, not just a highlight.
- Wash photography with the `.washed` wrapper and keep its edges rounded.

### Don't

- Do not draw sharp corners or hairline-only geometry.
- Do not desaturate the palette into greys — warmth is the point.
- Do not use condensed or geometric display faces; Caprasimo is the only display voice.
- Do not crowd elements; the rounded shapes need air to read as soft.

### System files

- `styles.css` — the only stylesheet: the token sheet (`:root` variables, ramps, base type)
  plus the component layer. Link it from every page.
- `readme.md` — the system guide.
- `theme.json` — the parameters these files were derived from.
- `thumbnail.html` — the project cover (brand mark + swatches).
- `foundations/type.html` — the type scale and the heading/body pairing at real sizes.
- `foundations/color.html` — color roles and the 100-900 tonal ramps, with usage notes.
- `foundations/layout.html` — the spacing scale, the grid and how edges are drawn.
- `foundations/icons.html` — the icon set at interface sizes, inline and in buttons.
- `foundations/image.html` — how photographs and figures are treated.
- `components/buttons.html` — buttons, icon buttons and tags in every variant and state.
- `components/forms.html` — text fields, radios and the segmented control on native elements.
- `components/cards.html` — content cards and the elevation steps.
- `components/navigation.html` — the header bar pattern.
- `components/table.html` — a data table with the themed header and row rules.
- `components/dialog.html` — a modal over its backdrop at the top elevation.
- `theme.html` — the theme's parameters rendered as a reference sheet.
- `templates/landing/` — a starter page consuming the system the intended way.
- `assets/photo.jpg` — the reference photograph the imagery page treats.

---

## 2. Site conventions

Layered on top of Organic, specific to this site.

### Brand

**Canyon Creek Health and Wellness.** The circular emblem (mountains, creek, leaf) is the
nav and footer mark, at `assets/logo-mark.png`; the full lockup is `assets/logo.png`.
The mark is rendered with `mix-blend-mode: multiply` so its near-white background dissolves
into the cream ground — keep that when placing it on any warm surface.

### Voice

Calm, clinical, trustworthy. Plain language over marketing language. Addiction is described
as a medical condition, never a personal failing. Future services are always framed as
aspirational and clearly labelled "Coming soon" — never implied to be available today.

### Page structure

Every page loads the design system in `<helmet>`, then:

```
<dc-import name="SiteNav" active="…">  →  page content  →  <dc-import name="SiteFooter">
```

`SiteNav` takes an `active` prop (`services` | `about` | `blog` | `account` | `""`) to tint
the current link with `--color-accent`.

### Shared layout tokens

- `.u-wrap` — `max-width: 1180px; margin: 0 auto; padding: 0 clamp(20px, 5vw, 72px)`.
  Narrow pages (Spravato, Peptides) use 1000px.
- Section rhythm — roughly 56–72px of vertical padding between major sections.
- Alternating ground — most sections sit on `--color-bg`; a full-bleed
  `background: var(--color-surface)` band breaks up long pages.
- Decorative blob — a large `--color-accent-2-200` circle, absolutely positioned off the
  top-right of a page header at `z-index: -1`. Used on Landing, Services, About, Blog,
  Spravato and Peptides.
- CTA patch — a `--color-accent-2-100` panel at `--radius-lg` closes most pages.

### Type in practice

- Page title (`h1`) — `clamp(38px, 5vw, 64px)`, `line-height: 1.05`, `letter-spacing: -0.01em`.
- Section heading (`h2`) — `clamp(28px, 3.2vw, 40px)`.
- Kicker — 13px, uppercase, `letter-spacing: 0.06em`, weight 600, `--color-accent-700`.
  Sits above almost every section heading.
- Body — 16px at `line-height: 1.65–1.75`; supporting copy 14–15px.
- Body copy is dimmed with `color-mix(in srgb, var(--color-text) 80-84%, transparent)`
  so headings hold the hierarchy.

### Imagery

All photographs are `<image-slot>` placeholders inside a `.washed` figure with
`--radius-lg` and a shadow. Slots carry stable, unique `id`s so dropped images persist.
Current slots: `home-philosophy`, `detail-hero`, `about-owner`, `team-1`–`team-4`,
`blog-featured`, `blog-1`–`blog-6`.

### Icons

Lucide paths drawn inline at stroke-width 2.75, sized 22–24px, set inside a 44–50px circle
filled `--color-accent-100` (or `--color-accent-2-100` for the sage voice) with the matching
`-700` step as the stroke color.

### Selection patterns

Selectable cards (booking service/provider/date/time) use a transparent 2px border by
default and `2px solid var(--color-accent)` when selected — so selection never shifts layout.
Pill toggles (portal tabs, patient type) fill solid `--color-accent` with `--color-bg` text
when active.

---

## 3. Pages

| File                                     | Purpose                                                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `Landing.dc.html`                        | Hero, value pillars, services grid, coming-soon strip, philosophy, how-it-works, quote, CTA           |
| `Services.dc.html`                       | Six current services with condition chips, plus a future-services band                                |
| `ServiceDetail.dc.html`                  | Service template, built on Ketamine Therapy — indications, what to expect, sticky quick-facts sidebar |
| `About.dc.html`                          | Three anchored sections: `#company`, `#owner`, `#team`                                                |
| `Booking.dc.html`                        | Five-step flow — service → provider → date/time → details → confirmation, with a live summary sidebar |
| `Blog.dc.html`                           | Category chips, featured post, post grid, newsletter patch                                            |
| `Account.dc.html`                        | Sign-in / sign-up, then a portal with Overview, Appointments, Messages, Documents, Profile            |
| `Spravato.dc.html`                       | Coming soon — three explainer cards + notify capture                                                  |
| `Peptides.dc.html`                       | Coming soon — treatment-goal list + notify capture                                                    |
| `SiteNav.dc.html` / `SiteFooter.dc.html` | Shared chrome                                                                                         |

### Outstanding placeholders

Owner and team names, bios and portraits; phone number and email; real photography;
practice address and hours. Booking and the patient portal are front-end mockups with no
backend.
