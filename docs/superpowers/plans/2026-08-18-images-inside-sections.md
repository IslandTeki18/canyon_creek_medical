# Plan: Images inside sections (ticket 12)

Source: `docs/wayfinder/admin-content-editors/tickets/12-images-inside-sections.md`

## Already done (no work)

- `image` section type with `storageId` + `alt`; strict schema requires alt
  `min(1)`, draft allows `""` (`convex/lib/content.ts`).
- Section image URL maps on public queries (`imageUrls`) and canvas image
  upload UI with alt field (`section-canvas.tsx`).
- Blog cover already lives inside `content` as `content.imageStorageId`
  (no top-level column). The migration folding it in already exists.

## Remaining gaps

| #   | Gap                                                                                                                    | Where                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Service pages upload via `blog.generateImageUploadUrl` (`content.author`), so authz is wrong for `config.manage` pages | `service-pages-page.tsx:92`                                                           |
| 2   | No confirm step, no type/size limits, no publish-time re-validation                                                    | none                                                                                  |
| 3   | Cover is `imageStorageId` (no alt); service pages have no cover slot; public renders `alt=""`                          | `lib/content.ts:74`, `blog-page.tsx`, `blog-post-page.tsx`, `service-detail-page.tsx` |
| 4   | Admin `getServicePage` / `getPost` return no URL map for drafts                                                        | `content.ts`, `blog.ts`                                                               |
| 5   | No orphan release on publish / discard / remove                                                                        | none                                                                                  |

## Steps

### 1. `convex/lib/contentImages.ts` (new)

Mirrors `lib/documents.ts`:

- `ALLOWED_IMAGE_TYPES = ["image/jpeg","image/png","image/webp"]`,
  `MAX_IMAGE_BYTES = 5 * 1024 * 1024`.
- `contentImageProblem(stored): string | null` — missing / wrong type /
  oversized message.
- `collectImageIds(content): string[]` — `coverImage?.storageId` + every
  `image` section, over a loosely typed `{coverImage?, sections?}` so it works
  for both content types.
- `releaseImages(ctx, before: string[], after: string[])` — for each id in
  before-not-after, scan all `servicePages` and `blogPosts` rows
  (`content` + `draftContent`) and `ctx.storage.delete` if unreferenced.
  `// ponytail:` full scan of two small tables.

### 2. Schema: `coverImage`

`convex/lib/content.ts`:

- `contentImage = (min) => z.object({ storageId: nonEmpty, alt: min===1 ? nonEmpty : z.string() }).strict()`;
  reuse it in the `image` section (replace inline shape).
- Blog: replace `imageStorageId` with `coverImage: contentImage(min).optional()`.
- Service: add `coverImage: contentImage(min).optional()`.

### 3. Mutations in `convex/domains/content.ts`

- `generateContentImageUploadUrl({ for: "servicePage" | "blogPost" })`,
  capability `config.manage` / `content.author` respectively.
- `confirmContentImage({ storageId, for })` — same capability check;
  `ctx.db.system.get`; on problem, `ctx.storage.delete` and **return**
  `{ ok: false, error }`; else `{ ok: true }`.
- Delete `blog.generateImageUploadUrl`.
- Publish (`publishServicePage`, `blog.publishPost`): after strict parse,
  `system.get` every id from `collectImageIds`; any problem throws
  `PUBLISH_VALIDATION_FAILED` with `path` pointing to `coverImage` or
  `sections.<index>` so the existing panel links to it. Then
  `releaseImages(ctx, collect(content), collect(newContent))`.
- Discard (`discardServicePageDraft`, `blog.discardPostDraft`):
  `releaseImages(ctx, collect(draftContent), collect(content))`.
- Save draft (`saveServicePageDraft`, `blog.savePostDraft`): only when the
  row has **no** `content` (never published), release ids dropped between old
  and new `draftContent`. This is the "Remove image with no published copy"
  moment without a new mutation. Cost: a scan only when an id actually
  disappears, never on ordinary keystrokes.
- `blog.createPost`: accept `coverImage` instead of `imageStorageId`.

### 4. Queries

- `toPublicPost`: `coverImage: { url, alt } | null` replaces `imageUrl`.
- `toPublicServicePage`: add same `coverImage` and strip `storageId` from the
  returned `content` (`{...content, coverImage: undefined}`).
- Admin `getServicePage`, `getPost`: return `{ ...doc, imageUrls }` where the
  map covers `collectImageIds` of both `content` and `draftContent`.
  `listPosts` keeps `imageUrl` for the card (derive from `coverImage`).

### 5. Migration

Add a step to `convex/migrations/sectionContent.ts` (already the content
migration, currently modified in the working tree): for every blog row, in
both `content` and `draftContent`, if `imageStorageId` exists, set
`coverImage = { storageId, alt: "" }` and delete `imageStorageId`. Idempotent.
Also update `contentSeed.ts` if it writes `imageStorageId` (verify).

### 6. Client

- Shared `uploadContentImage(for, file)` helper in
  `src/features/administration/` (one small module): generate → POST →
  confirm; throws the confirm error. Replaces the two duplicated
  `uploadImage` functions; canvas `uploadImage` prop calls it. `accept`
  narrowed to `image/jpeg,image/png,image/webp` in the canvas and cover inputs.
- Blog editor: cover rail group gets an **Alt text** field; state uses
  `content.coverImage`; remove clears it. Create path uploads then passes
  `coverImage`.
- Service page editor: new cover rail group (upload, preview from
  `imageUrls`, alt field, remove), copied from the blog one.
- Public: `blog-page.tsx`, `blog-post-page.tsx` render `coverImage.alt`;
  `service-detail-page.tsx` hero renders `<img>` when `coverImage`, else the
  existing `aria-hidden` band unchanged.

## Files likely to change

| File                                                                                 | Change                                                                           |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `convex/lib/contentImages.ts`                                                        | new                                                                              |
| `convex/lib/content.ts`                                                              | `contentImage`, `coverImage` on both schemas                                     |
| `convex/domains/content.ts`                                                          | upload/confirm mutations, publish check, release hooks, query maps, public shape |
| `convex/domains/blog.ts`                                                             | remove upload mutation, `coverImage`, publish check, release hooks, query maps   |
| `convex/migrations/sectionContent.ts`                                                | cover step                                                                       |
| `convex/domains/contentSeed.ts`                                                      | only if it references `imageStorageId`                                           |
| `src/features/administration/upload-content-image.ts`                                | new shared client upload                                                         |
| `src/features/administration/service-pages-page.tsx`                                 | cover rail group, upload helper                                                  |
| `src/features/administration/blog-posts-page.tsx`                                    | alt field, `coverImage`, upload helper                                           |
| `src/components/ui/section-canvas.tsx`                                               | `accept` list only                                                               |
| `src/features/public/blog-page.tsx`, `blog-post-page.tsx`, `service-detail-page.tsx` | alt + hero                                                                       |

## Assumptions and risks

- Ticket text assumes a top-level `imageStorageId` column; the code has it
  inside `content` already. Migration is a content reshape, not a column drop.
- Public shape change (`imageUrl` → `coverImage`) touches every blog consumer;
  kept to the four files above. Any test fixtures using `imageUrl` will need
  updating (out of this plan's scope by request, but they will break).
- `saveDraft` release only fires for never-published rows; an image dropped
  from the draft of a published page is released at publish/discard, per
  ticket. Abandoned uploads leak, per ticket.
- `releaseImages` runs a full-table scan inside publish/discard/draft-save
  mutations. Fine at this size; flagged with `ponytail:`.
- `sectionContent.ts` has uncommitted changes; adding the cover step there
  couples this work to whatever is in flight. Alternative: a new
  `convex/migrations/coverImage.ts`. Default: extend existing file.
- Existing published posts get `alt: ""` and are blocked on next republish
  until alt is written. Intended per ticket.

## Acceptance criteria

- Service page image upload requires `config.manage`; blog upload requires
  `content.author`; `blog.generateImageUploadUrl` no longer exists.
- Uploading an SVG or a >5 MB file is rejected at confirm with a message and
  the file is deleted from storage.
- Publish fails with a linked issue if any image is missing alt text, is
  missing from storage, wrong type, or oversized.
- Blog and service pages both have an optional cover with alt; service hero
  shows `<img alt>` when set, decorative band otherwise.
- All public `<img>` elements carry founder-written alt.
- Admin `getServicePage` / `getPost` expose URLs for draft images; the editor
  preview uses them.
- Publish and discard delete storage files no longer referenced by any row.
- Migration converts existing `imageStorageId` to `coverImage` idempotently.
- Strict TS, lint pass.

## Verification plan

1. `pnpm typecheck && pnpm lint`; run the migration locally against seed data
   and inspect a blog row.
2. Manual, service page editor: upload jpeg cover → preview shows; publish
   without alt → issue listed, linked; add alt → publish succeeds; public hero
   shows image with alt; remove cover on a draft-only page → storage file gone.
3. Manual, blog editor: existing post shows cover with empty alt; republish
   blocked until alt entered; card list still shows cover thumbnail.
4. Upload an `.svg` and a 6 MB png in both editors → rejected with message.
5. Public blog list and post render alt attributes (inspect DOM).
6. Discard edits after swapping an image on a published page → old file
   retained, new file deleted.
