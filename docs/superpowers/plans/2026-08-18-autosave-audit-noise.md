# Plan: Autosave frequency and audit noise (ticket 08)

Source: `docs/wayfinder/admin-content-editors/tickets/08-autosave-audit-noise.md`

## Already done (no work)

- Unaudited `saveServicePageDraft` / `savePostDraft` writing `draftContent`,
  `draftUpdatedAt`, `draftUpdatedByUserId`; `updatedAt` untouched; stamps
  cleared at publish/discard.
- `useAutosave` (`src/features/administration/use-autosave.ts`): 1s debounce,
  10s hard flush, immediate flush for structural edits via `flushNow(next)`,
  flush on blur, flush on unmount, single in-flight save with one trailing job.
- `AutosaveStatus`: "Saving…" / "Saved N ago", 30s re-render.
- Create mutations already write `draftContent` only, no `content`.

## Remaining gaps

| #   | Gap                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Failure handling: errors show as a one-line message; no persistent banner, no distinction between transient and rejection, no "copy text" escape |
| 2   | No `useBlocker` / `beforeunload` while dirty or failed                                                                                           |
| 3   | New page/post is an in-editor "create mode" with slug + fields; ticket wants a title-only dialog that creates the row first, then edits          |
| 4   | `createServicePage` / `createPost` take full content + slug; ticket wants `{ title }`                                                            |

## Steps

### 1. Failure model in `useAutosave`

Convex's client already queues a mutation and retries it across reconnects;
a `save()` promise only rejects when the server throws. So the ticket's
"transient, retry with backoff" is largely handled below us. Implement:

- Expose `dirty: boolean` state (true when unflushed edits or last save
  failed) and keep `error`.
- On rejection: stop; do **not** re-run the same value. Any subsequent edit
  re-arms the debounce as today (that is the natural retry).
- Add `savingSince` so the editor can show the "still trying" banner when a
  save has been in flight for more than a threshold (e.g. 5s) — this covers
  the offline case where Convex is holding the mutation.
  `// ponytail:` no client-side backoff loop; Convex retries transport
  failures itself, and a server rejection is a bug that must not be retried.

Editor banner (both editors, replaces the current `autosave.error` line):

- In flight > 5s: "Your changes aren't saving right now. We're still trying —
  please keep this page open."
- Rejected: "Your changes couldn't be saved. Copy your text before leaving."
  with a **Copy page text** button that puts the richText sections' text
  joined by blank lines onto the clipboard (`navigator.clipboard.writeText`).

Put the banner in a tiny shared component in `use-autosave.ts`
(`AutosaveBanner({ status, savingSince, error, onCopy })`) so both editors
render the same thing.

### 2. Navigation guard

New hook `useUnsavedGuard(dirty: boolean)` in `use-autosave.ts`:

- `useBlocker(({ currentLocation, nextLocation }) => dirty &&
currentLocation.pathname !== nextLocation.pathname)` — conditioned and
  path-scoped.
- When `blocker.state === "blocked"`, render an `AlertDialog` (existing
  `src/components/ui/alert-dialog.tsx`): "Leave anyway — your recent changes
  will be lost" / "Stay". Leave calls `blocker.proceed()`, Stay `reset()`.
- `useEffect` registering `beforeunload` (`event.preventDefault()`) only
  while `dirty`.

Rendered by both editor pages. Note the editors are single-route pages with
in-page selection; the blocker only matters for leaving `/admin/service-pages`
or `/admin/blog`. Switching cards already flushes via `autosave.reset(next,
true)`.

### 3. Server: title-only create

`convex/domains/content.ts` `createServicePage`:

- args `{ title }`; `slug = slugify(title)` server-side; reject on collision
  ("A page with this address already exists"); `sortOrder = max + 1`;
  `draftContent = parseServicePageDraft({ title, icon:"", summary:"", chips:[],
tags:[], intro:"", sections:[], facts:[], safetyNote:"" })`. Audit unchanged.

`convex/domains/blog.ts` `createPost`:

- args `{ title }`; slug derived; `draftContent = { title, category:
"Practice news", excerpt:"", authorName:"", sections:[] }` via draft schema.
  Category default is an assumption; flagged below.

Move `slugify` to `convex/lib/content.ts` (export) so client and server share
one implementation; the client copy in `blog-posts-page.tsx:56` is deleted
and imported instead.

### 4. Client: New dialog, remove create mode

New `src/components/ui/name-dialog.tsx` modelled on `reason-dialog.tsx`:
title, one text input, derived line beneath (`/services/<slug>` or
`/blog/<slug>`), Cancel / Create; shows the mutation error inline (slug
collision). Returns the created id via `onCreate(title): Promise<Id>`.

`service-pages-page.tsx`, `blog-posts-page.tsx`:

- **New service page / New post** button becomes the dialog trigger; on
  success `editPage(row)` / select the new post.
- Delete the create-mode branches: `selected === null` editor state, `save`
  create path, `imageFile` upload-on-create in blog, slug auto-derive on title
  change for new rows. Slug field stays editable for existing rows (via
  `updateServicePage`/`updatePost` as today).
- `resetEditor()` becomes "close editor" only.

## Files likely to change

| File                                                 | Change                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| `src/features/administration/use-autosave.ts`        | `dirty`, `savingSince`, `AutosaveBanner`, `useUnsavedGuard` |
| `src/components/ui/name-dialog.tsx`                  | new                                                         |
| `src/features/administration/service-pages-page.tsx` | banner, guard, dialog, remove create mode                   |
| `src/features/administration/blog-posts-page.tsx`    | same                                                        |
| `convex/domains/content.ts`                          | `createServicePage({ title })`                              |
| `convex/domains/blog.ts`                             | `createPost({ title })`                                     |
| `convex/lib/content.ts`                              | shared `slugify`                                            |
| `convex/domains/contentSeed.ts`                      | only if it calls the create mutations (verify)              |

## Assumptions and risks

- Transient retry is delegated to the Convex client; no bespoke backoff. If
  Convex surfaces a transport error as a rejection in some path, it will show
  as a rejection banner. Acceptable; flagged with `ponytail:`.
- Blog default category on create is `"Practice news"`; publish gate still
  requires the founder to confirm all fields. Change if a better default exists.
- Removing create mode is a large deletion in both editors; existing tests
  around create flows will break (out of plan scope, will need updating).
- `useBlocker` requires a data router; `routes.tsx` uses `createBrowserRouter`
  (verify during build). `beforeunload` shows the browser's generic text only.
- Concurrent editing remains last-write-wins, per ticket.

## Acceptance criteria

- Autosave never writes an audit row; publish/unpublish/discard/archive/create
  still do.
- Save in flight > 5s shows the "still trying" banner; a server rejection
  shows the rejection banner with a working Copy button and no retry storm.
- Leaving the editor route with unflushed or failed changes prompts "Leave
  anyway"; tab close prompts natively; no prompt when clean.
- New page/post opens a title dialog, creates the row, opens the editor; slug
  collision shown in the dialog.
- `createServicePage` / `createPost` accept only `{ title }`.
- Strict TS, lint pass.

## Verification plan

1. `pnpm typecheck && pnpm lint`.
2. Create a service page and a post via the dialog; confirm row exists with
   `draftContent.title`, no `content`, one `created` audit row; then type for a
   minute and confirm no further audit rows.
3. Duplicate title → collision error inside the dialog.
4. Go offline in devtools, type, wait 5s → banner; go online → "Saved".
5. Force a rejection (temporarily post an unknown section type via devtools
   or a one-off edit) → rejection banner, Copy works, no repeated calls in the
   network tab.
6. Type, immediately click a sidebar link → Leave/Stay dialog; Stay keeps
   state; wait for Saved then navigate → no dialog. Reload while dirty →
   native prompt.
