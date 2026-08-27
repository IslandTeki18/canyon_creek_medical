# Canyon Creek — Design System

The visual language for the Canyon Creek clinical practice platform: public marketing site, patient portal, staff clinical app, and practice administration.

This document describes the **blue clinical** direction built across the comps in this project. It supersedes the earlier "Organic" direction (sand/clay/sage, Caprasimo) still recorded in the source repository's `DESIGN.md` — that direction is preserved in `Canyon Creek Home.dc.html` for reference but is not the active system.

---

## 1. Principles

**Evidence over atmosphere.** The interface should read as a medical practice, not a wellness brand. Clarity, legibility and accurate labeling come before mood.

**One accent, used decisively.** A single blue carries every action, link and emphasis. When everything is highlighted, nothing is. Teal appears only as a secondary voice for holistic and advisory content.

**Whitespace is structure.** Generous padding and a light ground do the work that borders and dividers would otherwise do. Cards float on soft shadow, not outlines.

**No screen exists only to navigate.** Hub pages made of cards that lead elsewhere are replaced by persistent navigation plus a real work surface. Every screen should let someone do something.

**Dignity in copy and in layout.** Addiction is a medical condition. Never a personal failure. This holds in tone, and in refusing to visually quarantine addiction services from the rest of care.

---

## 2. Color

### Ground and surface

| Token           | Value     | Use                                               |
| --------------- | --------- | ------------------------------------------------- |
| `ground`        | `#eef4fb` | Default page background, all surfaces             |
| `ground-deep`   | `#dde7f4` | Desk background behind app frames; comp backdrops |
| `surface`       | `#ffffff` | Cards, panels, sheets                             |
| `surface-inset` | `#f5f9fe` | Metric tiles inside a white card; row hover       |
| `field`         | `#f7fafd` | Input fills                                       |

### Ink

| Token      | Value                    | Use                                                   |
| ---------- | ------------------------ | ----------------------------------------------------- |
| `ink`      | `#0b2545`                | Primary text, headings, footer and sidebar background |
| `ink-80`   | `rgba(11,37,69,.8)`      | Long-form body copy                                   |
| `ink-70`   | `rgba(11,37,69,.7)`      | Standard body copy, ledes                             |
| `ink-60`   | `rgba(11,37,69,.6)`      | Supporting and meta text                              |
| `ink-50`   | `rgba(11,37,69,.5)`      | Labels, timestamps, placeholder captions              |
| `ink-30`   | `rgba(11,37,69,.3)`      | Chevrons, disabled marks                              |
| `hairline` | `rgba(11,37,69,.07–.12)` | Row dividers, rules                                   |

### Accent — blue

| Token           | Value     | Use                                                         |
| --------------- | --------- | ----------------------------------------------------------- |
| `primary`       | `#2166e8` | Buttons, links, active nav, emphasis words, highlight cards |
| `primary-deep`  | `#1a54c4` | Button hover; text on pale blue                             |
| `primary-tint`  | `#e7efff` | Icon tiles, pills, category tags                            |
| `primary-ghost` | `#cfdff8` | Oversized ghost numerals (01, 02…)                          |

### Accent — teal (secondary)

| Token       | Value     | Use                                            |
| ----------- | --------- | ---------------------------------------------- |
| `teal`      | `#2f8a94` | Holistic care, advisory notes, "ready" status  |
| `teal-tint` | `#e6f3f4` | Safety notes, coming-soon strip, holistic tags |

### Status

| Token                    | Value                 | Use                                               |
| ------------------------ | --------------------- | ------------------------------------------------- |
| `alert`                  | `#e0554a`             | Failed messages, blocking items, not-ready counts |
| `warn-ink` / `warn-tint` | `#b4501f` / `#fdeee7` | "Not ready" appointment status                    |
| `ok-ink` / `ok-tint`     | `#2f8a94` / `#e6f3f4` | "Ready" appointment status                        |

### Placeholder imagery

Image slots use a 45° stripe of `#e3ecf9` / `#d8e5f6` at 10–12px, with a monospace label on a white pill naming what belongs there. Never a gray box, never invented art.

**Rule:** at most two background colors per screen. Ground plus white, or ground plus navy. A third appears only as a tint inside a card.

---

## 3. Typography

**Plus Jakarta Sans**, weights 400 / 500 / 600 / 700 / 800. One family across all four surfaces.

| Role                 | Size                       | Weight  | Tracking           |
| -------------------- | -------------------------- | ------- | ------------------ |
| Display (page title) | `clamp(38px, 5vw, 66px)`   | 800     | `-0.03em`          |
| Section heading      | `clamp(26px, 3.2vw, 44px)` | 800     | `-0.025em`         |
| Article H2           | `clamp(24px, 2.5vw, 30px)` | 800     | `-0.025em`         |
| Card title           | 19–22px                    | 700     | `-0.02em`          |
| App screen title     | 30px                       | 800     | `-0.025em`         |
| Lede                 | 17–18.5px                  | 400     | —                  |
| Body                 | 16–17px                    | 400     | —                  |
| Body (app / dense)   | 14–15px                    | 400–600 | —                  |
| Meta / caption       | 12.5–13.5px                | 400–600 | —                  |
| Eyebrow              | 11–12.5px                  | 700     | `.08em`, uppercase |

**Line height:** 1.85 for long-form article copy, 1.7 for marketing body, 1.6–1.65 for card copy, 1.06–1.25 for headings.

**Rules.** Heavy weights (800) carry all display type — never rely on size alone. Negative tracking scales with size. `text-wrap: pretty` on every heading and lede. Emphasis inside a heading is a single blue word, at most once per heading. Numerals in schedules and tables use `font-variant-numeric: tabular-nums`.

---

## 4. Geometry

### Radius

| Scale   | Use                                         |
| ------- | ------------------------------------------- |
| 32px    | Hero panels, full-width CTA blocks          |
| 28px    | Section panels, cover images, sidebar cards |
| 24px    | Standard card, app frame, grouped list      |
| 20–22px | Small cards, mobile cards, tiles            |
| 16–18px | Inset tiles, list thumbnails                |
| 12–14px | Icon tiles                                  |
| 999px   | Buttons, pills, tags, inputs, avatars       |

### Elevation

| Level       | Value                              | Use                          |
| ----------- | ---------------------------------- | ---------------------------- |
| Card        | `0 4px 20px rgba(11,37,69,.05)`    | Default card rest state      |
| Card raised | `0 12px 34px rgba(11,37,69,.11)`   | Card hover                   |
| Panel       | `0 10px 40px rgba(11,37,69,.07)`   | Hero and section panels      |
| App frame   | `0 16px 50px rgba(11,37,69,.14)`   | Staff/admin window in a comp |
| Blue action | `0 8px 22px rgba(33,102,232,.26)`  | Primary buttons              |
| Blue panel  | `0 16px 44px rgba(33,102,232,.26)` | Solid-blue CTA blocks        |

No borders on cards. Elevation and background contrast define edges. Borders appear only on inputs (`1.5px rgba(11,37,69,.14)`), secondary buttons, and hairline row dividers.

---

## 5. Layout

**Content width** `1220px` max, gutter `clamp(20px, 5vw, 64px)`. Article measure caps at `68ch`.

**Wrapping over breakpoints.** Multi-column arrangements use `display: flex; flex-wrap: wrap` with `flex: 1 1 <basis>; min-width: 0` on each child — never a fixed `grid-template-columns` two-column split. Columns reflow at their own content width instead of a guessed viewport. Card grids use `repeat(auto-fill, minmax(280–300px, 1fr))`; footer and tile rows use `repeat(auto-fit, minmax(150–220px, 1fr))`.

**Typical basis values:** article `1 1 560px`, sidebar `1 1 320px` (or `0 1 240px` for a TOC), hero copy `1 1 440px`, hero figure `1 1 320px`.

**Spacing rhythm.** Section vertical padding 56–76px. Card padding `clamp(26px, 3vw, 44px)` for panels, 20–28px for standard cards. Gaps: 10–14px within a group, 20–26px between cards, `clamp(32px, 5vw, 72px)` between major columns.

**Sibling groups always use flex/grid with `gap`** — never inline spacing or per-element margins.

**Device targets.** Desktop and mobile for public and portal surfaces; mobile comps are drawn at 390px. Staff and admin are desktop-only by design — they are desk tools. Touch targets never below 44px.

---

## 6. Components

**Primary button.** Pill, `#2166e8`, white text, 600 weight, 13–15px, padding 13–15px × 20–26px, blue shadow. Hover `#1a54c4`. On a blue field it inverts: white fill, blue text.

**Secondary button.** Pill, transparent, `1.5px` hairline border, 600 weight. Hover borders and colors to blue.

**Tag / pill.** Pill, 11–12px, 700 weight. Blue tint for primary categories, teal tint for holistic, white for neutral. Solid blue with white text marks an active filter.

**Card.** White, radius 24px, card shadow, 20–28px padding, `flex-direction: column` with `gap`. A card that is a link wraps the whole surface in an `<a>`.

**Highlight card.** Exactly one card per grid gets solid `#2166e8`, white text, blue panel shadow — used for the flagship item (Ketamine Therapy in services, the monitored session in a step list). Never two in one grid.

**Numbered card.** Icon tile left, oversized ghost numeral right, on one row above the title. Numerals 26–34px, 800 weight, `primary-ghost`.

**Step list.** `<ol>`, no bullets, each item a card with a rounded-square number tile (44px, radius 14px, blue tint fill, blue 800-weight numeral). The pivotal step is a highlight card.

**Advisory panel.** Teal tint, radius 24px, icon tile plus heading plus body. Carries safety notes, disclaimers and crisis information. Never red — these are informational, not errors.

**Grouped list (admin).** White card, uppercase blue group label, then rows separated by hairlines. Each row: 38px icon tile, title plus one-line description, chevron. Row hover `#f5f9fe`. This replaces grids of navigation cards.

**Metric tile.** White card or `surface-inset` tile, number at 26–34px / 800 / `-0.03em`, label at 12.5–13px / 600 / `ink-60`. Number takes status color when it demands action.

**App sidebar.** 264px, `#0b2545`, 24px vertical padding. Items 44px minimum, radius 12px, 18px masked icon plus label. Active item solid `#2166e8`. Inactive `rgba(255,255,255,.72)`, hover `rgba(255,255,255,.08)`. Counts sit right-aligned as pills — blue for actionable, red for failures, plain text for informational. A rule above the account block pins it to the bottom.

**Footer.** `#0b2545`, white wordmark, `auto-fit` columns, 13.5px links at 62% white opacity.

**Input.** Pill or rounded, `#f7fafd` fill, `1.5px rgba(11,37,69,.14)` border, focus border blue, 14–14.5px.

---

## 7. Iconography

Lucide, loaded as static SVG applied via CSS `mask` so a single element takes any color:

```
background: #2166e8;
mask: url(https://unpkg.com/lucide-static@0.446.0/icons/brain.svg) center/contain no-repeat;
```

Sizes: 18px in sidebars, 19–23px in tiles, 12–13px in inline check marks.

Icons live inside a rounded tile (radius 12–14px, tint fill), never bare on a surface. Service icons are fixed per service and must match the assignments in the application source: brain (mental health), pill (medication management, MAT), shield (addiction medicine), sparkles (ketamine), leaf (holistic).

**No emoji. No hand-drawn SVG illustration.** Real photography or a labeled placeholder.

---

## 8. Content and voice

Plain language, matter-of-fact, second person. Explain the reasoning, not just the instruction. No marketing superlatives, no urgency, no promises about outcomes.

- Addiction is described as a chronic medical condition. Never a failing.
- Services state what is involved and who they suit, not how transformative they are.
- Every clinical page carries an informational disclaimer.
- Crisis resources (988) appear on mental-health long-form content.
- Bylines read "Canyon Creek clinical team" until real clinician names and credentials are supplied.

Any copy that exists in the application source is used **verbatim**. Written-from-scratch copy is limited to surfaces with no seeded content.

---

## 9. Screens in this project

| File                                  | Surface                                                 |
| ------------------------------------- | ------------------------------------------------------- |
| `Canyon Creek Home v2.dc.html`        | Public home — desktop + 390px                           |
| `Canyon Creek Service Detail.dc.html` | Service detail (Ketamine Therapy) — desktop + 390px     |
| `Canyon Creek Blog.dc.html`           | Journal index — desktop + 390px                         |
| `Canyon Creek Blog Post.dc.html`      | Article — desktop + 390px                               |
| `Canyon Creek Staff App.dc.html`      | Staff workspace + Administration — desktop              |
| `Canyon Creek Home.dc.html`           | Superseded warm/editorial direction, kept for reference |

Each comp is a Design Component with section toggles exposed as tweakable props (cover images, related lists, newsletter, mobile comp, feature flags).

---

## 10. Open items

- **No logo asset exists.** The brand renders as a plain text wordmark at 800 weight, `-0.02em`. A mark has been referenced but never supplied.
- **Clinician names, credentials and photography** are unresolved; team content uses the practice-level byline.
- **Journal content** is written for these comps — the application has no seeded posts.
- **Patient portal** beyond booking, and the clinical charting surfaces, are not yet designed.
- **Source repository divergence.** The repository's `DESIGN.md` and `index.css` still define the Organic token set. Adopting this direction in code means replacing both.
