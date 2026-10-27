# Handoff: Canyon Creek logo

## Overview
Replace the text-only "Canyon Creek" brand in the app with the supplied logo (circle mark with mountains, river and leaf sprig, plus "CANYON CREEK / HEALTH AND WELLNESS" lockup). Four placements: site header, site footer, admin sidebar, favicon/social.

## About the design files
`Logo Placement.dc.html` is an HTML design reference showing each placement at rendered size. Recreate it in the existing React + Tailwind codebase (`IslandTeki18/canyon_creek_medical`), not by copying the HTML. Files in `assets/` are production-ready PNGs.

## Fidelity
High-fidelity for sizes, spacing and which asset goes where. Match the specified pixel heights.

## Assets (`assets/`)
Derived from the client's PNG (`source-logo.png`, 1254×1254, opaque cream background). Background knocked out to transparency; 24px padding on each file.

| File | Content | Px | Use on |
| --- | --- | --- | --- |
| `logo-mark.png` | Circle mark only, full color | 542×511 | Light grounds (#eef4fb, #fff) |
| `logo-mark-white.png` | Circle mark, white knockout | 542×511 | Navy (#0b2545) and blue (#2166e8) |
| `logo-lockup.png` | Mark + wordmark + tagline, full color | 1005×742 | og:image, print, light grounds |
| `logo-lockup-white.png` | Same, white knockout | 1005×742 | Footer |
| `logo-wordmark.png` / `-white.png` | "CANYON CREEK / HEALTH AND WELLNESS" only | 1005×233 | Only if the serif wordmark must appear without the mark |

Logo colors (sampled): olive `#586137` (ring, leaf, tagline), tan `#796d52` (mountains), slate blue `#6f8b91` (river), deep olive `#1f2203` (wordmark).

Put them in `public/brand/`.

## Placements

### 1. Site header — `src/features/public/marketing-chrome.tsx` → `SiteNav`
Replace the `Canyon Creek` text link with:
```tsx
<Link to="/" className="mr-auto flex items-center gap-2.5 text-[19px] font-extrabold tracking-[-0.02em] text-ink no-underline">
  <img src="/brand/logo-mark.png" alt="" className="block h-9 w-auto" />
  Canyon Creek
</Link>
```
Mark height 36px, gap 10px. Keep the Plus Jakarta Sans wordmark text; do not use the serif wordmark image in the nav (too light at this size). Below `md`: mark `h-8` (32px), text 16px.

### 2. Site footer — `SiteFooter`
Replace the text wordmark `div` with `<img src="/brand/logo-lockup-white.png" alt="Canyon Creek Health and Wellness" className="block w-[180px] h-auto" />`, 16px gap to the description paragraph.

### 3. Admin sidebar — `src/components/staff-shell.tsx` → `AdminShell`
```tsx
<NavLink to="/" className="flex items-center gap-2.5 px-2.5 text-[17px] font-extrabold tracking-[-0.02em] text-white no-underline">
  <img src="/brand/logo-mark-white.png" alt="" className="block h-7 w-auto" />
  Canyon Creek
</NavLink>
```
Mark height 28px.

### 4. Favicon, touch icon, social — `index.html`, `public/`
- `favicon.svg` is referenced but no vector exists. Export `logo-mark.png` at 32×32 and 180×180 (`apple-touch-icon`) on transparent ground; add `<link rel="icon" type="image/png" sizes="32x32">` and `<link rel="apple-touch-icon">`.
- `og:image`: 1200×630, ground `#eef4fb`, `logo-lockup.png` centered at ~680px wide. Add `og:image`, `og:title` ("Canyon Creek Health and Wellness"), `og:description` meta.
- Update `<title>` to "Canyon Creek Health and Wellness".

## Accessibility
Where the text "Canyon Creek" sits next to the image, the image gets `alt=""`. Where the image stands alone (footer lockup, og), `alt="Canyon Creek Health and Wellness"`.

## Caveats
- **Raster only.** The source is a 1254px PNG, likely AI-generated: edges are soft and the circle is not geometrically perfect. The cutouts hold up at ≤180px rendered. Request a vector (SVG/AI) from the client for favicon and print; until then do not render the mark above ~200px.
- **Palette tension.** The logo is olive/tan/slate; the active system (DESIGN.md) is navy/blue `#2166e8`. In the header the full-color mark sits on pale blue and reads fine as an isolated object. On navy and blue surfaces always use the white knockout, never the color mark. Do not introduce olive as a UI color to "match" it — one accent stays blue.
- The serif wordmark in the lockup is not Plus Jakarta Sans; keep it inside the image only.

## Files
- `Logo Placement.dc.html` — placement reference (open in a browser; expects `assets/` alongside)
- `assets/` — the six PNGs above plus `source-logo.png`
- Repo files touched: `src/features/public/marketing-chrome.tsx`, `src/components/staff-shell.tsx`, `index.html`, `public/`
