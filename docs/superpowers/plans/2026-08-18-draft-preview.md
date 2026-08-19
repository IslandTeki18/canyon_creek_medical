# Plan: Previewing an unpublished draft (ticket 13)

Source: `docs/wayfinder/admin-content-editors/tickets/13-draft-preview.md`

## Current state

- Public pages fetch their own data: `service-detail-page.tsx` uses
  `getPublishedServicePage`, `blog-post-page.tsx` uses `getPublishedPost` +
  `listPublishedPosts` (related posts).
- Admin getters `getServicePage` (`config.manage`) and `getPost`
  (`content.author`) already return the raw row plus `imageUrls` covering
  `content` and `draftContent`, including cover ids.
- Both admin cards already have a **View as visitor** link, shown only for
  published pages and pointing at the public route (live version, not draft).
- Public payload shape differs from the row: `{ slug, content (minus
coverImage), coverImage: {url, alt} | null, imageUrls }` for services;
  flattened fields + `coverImage` + `imageUrls` for posts.

## Steps

### 1. Split each public page into presentation + data wrapper

`src/features/public/service-detail-page.tsx`

- Extract `ServiceDetailView({ page })` taking the existing public payload
  type (`typeof getPublishedServicePage` result, non-null). Move all JSX,
  legacy-section fallback, and `PublicServicePageContent` cast into it.
- Default export `ServiceDetailPage` keeps `useParams` + `useQuery` +
  loading/NotFound and renders `<ServiceDetailView page={page} />`.

`src/features/public/blog-post-page.tsx`

- Extract `BlogPostView({ post, related })`, `related` defaults to `[]`.
- Default export keeps the two queries and renders the view.

Export the two view components (named exports). No visual change.

### 2. Client-side adapter: admin row → public payload

One small module `src/features/administration/preview-payload.ts`:

- `toServicePreview(row)` → `{ slug, sortOrder, content: draft minus
coverImage, coverImage: cover ? { url: imageUrls[cover.storageId] ?? null,
alt } : null, imageUrls }` where `draft = row.draftContent ?? row.content`.
- `toPostPreview(row)` → same flattening `toPublicPost` does server-side,
  `publishedAt: row.publishedAt`.

Rationale: no new query (ticket), and the admin getter already carries every
URL needed. Duplicates ~15 lines of shape mapping from the server; flagged
below. Types come from `FunctionReturnType<typeof api...>` so drift is a
compile error.

### 3. Preview routes

`src/routes.tsx`, inside the marketing layout (so `MarketingPage` chrome
matches the public site), gated with `RequireAuth`:

- `admin/service-pages/:servicePageId/preview` → `config.manage` →
  `ServicePagePreviewPage`
- `admin/blog/:postId/preview` → `content.author` → `BlogPostPreviewPage`

Two thin lazy pages in `src/features/administration/`:
`service-page-preview-page.tsx`, `blog-post-preview-page.tsx`. Each:
`useParams` → `useQuery(getServicePage|getPost)` → loading / NotFound →
`toXPreview(row)` → `<XView …/>`. A fixed top banner "Preview of unpublished
draft" with a link back to the editor, so it cannot be mistaken for the live
page. Blog preview passes `related=[]`.

Server-side gate is the existing capability check in each getter;
`RequireAuth` is presentation only.

### 4. View as visitor: flush, then open the draft preview

`service-pages-page.tsx`, `blog-posts-page.tsx` card `menuActions`:

- Replace the published-only `<a href="/services/:slug">` with a button shown
  for any non-archived row: `await autosave.flushNow()` when the row is the
  one being edited, then `window.open("/admin/…/preview", "_blank")`.
- Keep a **View live page** link for published rows only (the current link,
  renamed) so the live/draft distinction is explicit.
- Also add the same button to the editor shell header actions if the shell
  exposes a slot (check `editor-shell.tsx`); otherwise card-only.

`window.open` after an `await` may be popup-blocked in some browsers. Mitigation
in the same step: open the window synchronously first (`const w =
window.open("", "_blank")`), flush, then set `w.location`. Fallback if `w` is
null: navigate in the same tab.

## Files likely to change

| File                                                        | Change                      |
| ----------------------------------------------------------- | --------------------------- |
| `src/features/public/service-detail-page.tsx`               | extract `ServiceDetailView` |
| `src/features/public/blog-post-page.tsx`                    | extract `BlogPostView`      |
| `src/features/administration/preview-payload.ts`            | new adapter                 |
| `src/features/administration/service-page-preview-page.tsx` | new                         |
| `src/features/administration/blog-post-preview-page.tsx`    | new                         |
| `src/routes.tsx`                                            | two gated routes            |
| `src/features/administration/service-pages-page.tsx`        | flush + open preview        |
| `src/features/administration/blog-posts-page.tsx`           | flush + open preview        |

No Convex changes.

## Assumptions and risks

- Ticket wants preview to live under `/admin/...`; the marketing chrome is
  reused so the preview looks like the public page. If `RequireAuth` inside the
  marketing layout is awkward, fall back to placing the routes in the admin
  layout and wrapping with `MarketingPage` manually.
- Adapter duplicates server-side public shaping. Alternative: export a pure
  `shapePublicServicePage(doc, urls)` from `convex/lib` and use it on both
  sides. Rejected for now: `toPublicX` are async over `ctx.storage`; splitting
  them is a larger refactor than the ~15 lines duplicated. Revisit if the
  public shape changes again.
- Preview shows `draftContent ?? content`; a never-published, never-saved row
  cannot exist, so no empty case beyond NotFound.
- Blog preview omits related posts (public list query is published-only and
  it is not the founder's content under review).
- Legacy rows without `sections` render via the existing fallback in the view.
- Deny-path tests and `data-exposure.test.ts` entry are required by the ticket
  but excluded from this plan per instruction; they must be added before merge.

## Acceptance criteria

- `/admin/service-pages/:id/preview` and `/admin/blog/:id/preview` render the
  draft through the exact public presentation with a visible draft banner.
- Unauthenticated or under-privileged callers get the existing
  `requireCapability` rejection from `getServicePage` / `getPost`; no new
  query exists.
- Public routes and public queries are unchanged.
- View as visitor on a card with a pending edit flushes first; the preview
  reflects the latest text.
- Published rows still offer a link to the live page.
- Strict TS, lint pass.

## Verification plan

1. `pnpm typecheck && pnpm lint`.
2. Public `/services/:slug` and `/blog/:slug` unchanged visually.
3. Edit a service page, type, immediately click View as visitor: preview shows
   the new text; the autosave status shows saved.
4. Same for a blog post; cover and section images render in preview.
5. Open a preview URL while signed out → redirected/denied by `RequireAuth`;
   call `getServicePage` from a `content.author`-only user via the Convex
   dashboard → rejected.
6. Never-published page: preview works, live link absent.
