---
title: Images inside sections
map: ../MAP.md
type: wayfinder:grilling
status: closed
closed: 2026-08-06
assignee: Landon McKell
blocked-by: []
---

## Question

Surfaced by [Section-based content model](10-section-based-content-model.md),
which added an `image` section type and a hero slot.

The asymmetry today: `blogPosts` has `imageStorageId` plus
`generateImageUploadUrl` and resolves a URL via `ctx.storage.getUrl`.
`servicePages` has **no image support at all** — the hero band on the service
detail page is a bare `aria-hidden` coloured div
(`src/features/public/service-detail-page.tsx:67-72`).

- How does a section reference an image — a storage id inside the section
  object, and how does the public query resolve ids to URLs for an arbitrary
  number of sections without an N+1 of `getUrl` calls?
- Service pages need upload support built from nothing. Does the blog's
  `generateImageUploadUrl` pattern generalise, or does uploading move into a
  shared content module?
- **Alt text is not optional.** Accessibility is on the never-simplify list.
  Is alt text required before publish, and what does the founder see if it is
  missing?
- Does the service page hero become a real uploaded image, and is it required?
- Orphaned files: autosaved drafts can accumulate uploads the founder later
  deletes or abandons. Is anything cleaned up, and when?
- Any constraint on file size, dimensions, or type, and is that enforced
  server-side rather than only in the browser?

## Answer

**One image shape, one upload path, alt text always required, and the cover
image moves inside `content` so it obeys the draft invariant.**

### The image shape

Two places carry an image, and both use the identical object so the collector,
the validator, and the editor component are written once:

```ts
type ContentImage = { storageId: string; alt: string };

// section
{ id: string, type: "image", storageId: string, alt: string }
// fixed slot, both content types
content.coverImage?: ContentImage
```

`content` is `v.any()` in the schema, so zod can only assert `storageId` is a
non-empty string. It is not an `Id<"_storage">` at the validator boundary; the
id is proven real by `ctx.db.system.get` at confirm and again at publish
(below). No caption field — the catalogue is closed by design
([Section-based content model](10-section-based-content-model.md)), and adding
one later is the intended code change.

### The cover image must move into `content`

`blogPosts.imageStorageId` is a **top-level column** today. That breaks
[Draft autosave on published content](01-autosave-published-content.md): a
founder swapping the cover of a published post would change the live public
page instantly, because only `content` is supposed to be the published version.

So `imageStorageId` is migrated into `content.coverImage` and the column is
dropped. Service pages gain the same `content.coverImage`, which is what the
hero band reads.

### The service hero: optional, band as fallback

`content.coverImage` is optional on service pages. When set, the hero renders
`<img>` with the founder's alt text. When absent, the existing coloured band
(`src/features/public/service-detail-page.tsx:67-72`) renders exactly as
today, keeping its `aria-hidden="true"` — it is decorative, and that is
correct.

The cost accepted: one slot with two visual states to design, test and keep in
sync. The gain: the six seeded service pages keep working untouched and the
founder adds art page by page instead of facing a six-image backlog before
anything can ship.

### Alt text is required, with no escape hatch

Every image — section or cover — must carry non-empty alt text before publish.
There is no "decorative" checkbox: it would be the path of least resistance and
would be over-used, and the one genuinely decorative surface (the fallback
band) is not an uploaded image at all.

Enforcement rides the gate already established by
[Partial drafts versus schema validation](02-partial-draft-validation.md):
the loose draft schema permits `alt: ""` (empty strings are structurally
valid), the strict publish schema requires `min(1)`, and Publish stays
clickable and lists "Image needs a description" linked to the owning section.

**This fixes an existing gap, not just new content.** Every image on the public
site ships `alt=""` today (`blog-page.tsx:35`, `blog-post-page.tsx:149`) and no
alt field exists anywhere in the schema.

**Migration handling of that gap:** the script copies `imageStorageId` into
`content.coverImage` with `alt: ""`. Published posts keep rendering exactly as
they do now, so there is no regression and no publish backlog. The publish gate
then blocks the _next_ republish of each post until the founder writes alt
text. The debt surfaces at the moment someone is already editing the post,
which is the cheapest moment to pay it.

### Upload path: the documents pattern, shared, capability-discriminated

`blog.generateImageUploadUrl` does **not** generalise as written — it requires
`content.author`, while every service page mutation requires `config.manage`
(`convex/domains/content.ts:21`). A shared upload URL that accepted either
would let a blog-only author place bytes in storage for service pages, which
violates the house principle stated at `convex/domains/documents.ts:68`:
_"Requires the same authority as attaching the document, so an unauthorized
caller cannot even place bytes in storage."_

So one mutation in `convex/domains/content.ts`, discriminated by target:

```ts
generateContentImageUploadUrl({ for: "servicePage" | "blogPost" });
// requires config.manage or content.author respectively
```

`blog.generateImageUploadUrl` is deleted.

The client then follows the same three-step shape `documents.ts` already uses
(generate URL → POST → confirm), which is why this adds no new machinery:

```ts
confirmContentImage({ storageId, for })
// ctx.db.system.get(storageId) -> real size + real contentType
// on rejection: delete the file and RETURN an error, never throw
//   (a throw rolls the transaction back and strands the bytes in storage)
```

Only after confirm succeeds does the client put the id into a section.

### Constraints, enforced server-side twice

`convex/lib/contentImages.ts`, mirroring `convex/lib/documents.ts`:

- **Types:** `image/jpeg`, `image/png`, `image/webp`. **No SVG** — it is an
  active-content format and serving it from storage is an XSS vector. The
  browser `accept` attribute is narrowed to match, but it is a convenience,
  not the check.
- **Size:** 5 MB. Read from storage metadata, never from the client.
- **Dimensions:** not constrained. Convex cannot decode an image in a mutation.
  Accepted ceiling: a founder can upload a 5 MB, 8000px image and it is served
  at full size. The size cap is the only backstop; revisit only if slow pages
  are actually observed.

Validated at **two** points, because a caller can skip `confirmContentImage`
and write a raw id straight into `draftContent` via autosave:

1. **At confirm** — fast feedback while the founder is still looking at the
   file picker.
2. **At publish** — the real trust boundary. The publish gate re-reads every
   referenced id through `ctx.db.system.get` and rejects missing files, wrong
   types, and oversized files. Publish is rare, so the extra reads are free.

Autosave itself never validates uploads — that would put a `system.get` per
image behind every keystroke batch.

### Resolving ids to URLs

`ctx.storage.getUrl` has no batch form and there is no way to avoid one call
per image. At this cardinality that is not a problem worth engineering around:
six service pages with one hero each, and a handful of image sections per
detail page. `await Promise.all(ids.map((id) => ctx.storage.getUrl(id)))` and
nothing more. No URL cache table.

> `ponytail:` per-image getUrl, parallelised. Only becomes interesting past a
> few hundred images on one query.

Two consequences in the queries:

- **Public queries substitute the URL and strip the id.** Public sections carry
  `{ url, alt }`, never `storageId` — consistent with the existing "projection
  excludes internal fields" comment on `listPublishedServicePages`. This makes
  `toPublicServicePage` (`convex/domains/content.ts:14`) **async and
  `ctx`-taking**, which it is not today; `listPublishedServicePages` wraps it
  in `Promise.all`. `blog.toPublicPost` is already async and is the precedent.
- **Admin queries add a map, not a new query.** `getServicePage` and the blog
  equivalent return the raw doc plus `imageUrls: Record<string, string>`
  covering both `content` and `draftContent`. No new query, which keeps
  [Previewing an unpublished draft](13-draft-preview.md)'s "no new query"
  result intact — the preview route reads the same admin query and gets draft
  image URLs for free.

### Orphan cleanup: on reference drop, no sweep

No cron sweep. A sweep must walk the section union across two tables, and one
missed reference site silently deletes a live public image; the blast radius is
worse than the storage it reclaims.

Instead, a shared helper does the work at the low-frequency moments where a
reference actually disappears:

```ts
collectImageIds(content): string[]   // coverImage + every image section
releaseImages(ctx, before, after)    // delete ids in `before` not in `after`
                                     // AND not referenced by any other row
```

**Autosave is deliberately not hooked.** Because of the draft invariant, a
swap inside `draftContent` leaves the old id still referenced by `content`, so
nothing is deletable at swap time anyway. The three moments that actually drop
a reference are:

1. Explicit **Remove image** on a page that has no published copy of it.
2. **Publish** — `draftContent` promotes over `content`, and this is where most
   deletions actually happen.
3. **Discard edits** — the draft is dropped, releasing anything only it held.

The reference check scans `content` and `draftContent` across all
`servicePages` and `blogPosts` rows. Two small marketing tables; a full scan is
correct and cheap.

> `ponytail:` full scan of two small tables. Index image ids only if the site
> ever grows to hundreds of pages.

**Accepted cost:** an upload that is autosaved into a draft and then abandoned
— the founder uploads, changes their mind, closes the tab and never returns —
leaks its file permanently. That is the exact case the rejected sweep would
have caught. Judged acceptable: marketing images are small and a two-person
clinic edits its website rarely.

No new audit action. Deletions ride inside the existing
`content.servicePage.updated` / `content.blogPost.updated` / publish events,
which already fire on the same mutations.

### What this changes elsewhere

- The migration in [Section-based content model](10-section-based-content-model.md)
  gains a step: `imageStorageId` → `content.coverImage` with `alt: ""`, then
  drop the column.
- The publish gate in [Partial drafts versus schema validation](02-partial-draft-validation.md)
  gains two rules: non-empty alt for every image, and a `system.get`
  re-validation of every referenced storage id.
- The hero being optional means the service template must render two states
  for one slot, which sharpens the remaining public-rendering fog enough to
  ticket.
