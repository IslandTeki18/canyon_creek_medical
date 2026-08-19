---
title: How other tools handle autosave on published content
map: ../MAP.md
type: wayfinder:research
status: closed
closed: 2026-08-05
assignee: research subagent
blocked-by: []
---

## Question

Surface prior art on the published-content autosave problem so
[Draft autosave on published content](01-autosave-published-content.md) is
decided against evidence rather than intuition.

Research and report:

- How WordPress, Ghost, Sanity, Contentful, and Notion handle editing a page
  that is already live: revision forks, explicit publish steps, or live edits.
- What each shows the user about the gap between the draft and the live
  version, and how the user reverts.
- Convex-specific patterns for debounced autosave mutations, and whether
  optimistic updates or the reactive query subscription cause an edit loop
  when the mutation writes back the field being typed into.
- React Router v8 behavior on unmount mid-autosave — is a debounced write at
  risk of being dropped when the founder navigates away.

Report findings on the ticket; do not make the decision here.

## Findings

Researched 2026-08-05. Primary sources preferred (vendor source code and
official docs). Claims that could not be verified from a primary source are
flagged inline.

### 1. Prior art: editing content that is already live

| Product    | Model                                                                                                                                              | Divergence signal shown to user                                                                                        | Revert path                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| WordPress  | **Fork.** Autosaves of a published post go to a separate revision row; the live row is untouched                                                   | "There is an autosave of this post that is more recent than the version below" notice; revision browser                | Do nothing (discard by not restoring); or restore a revision                                        |
| Ghost      | **Neither.** Published posts are not autosaved at all; edits sit in browser memory until explicit **Update**, which writes straight to live        | Only the green **Update** button becoming enabled                                                                      | Navigate away and decline the leave modal (unreliable), or restore from post history after the fact |
| Sanity     | **Fork.** Draft is a separate document `drafts.<id>`; debounced autosave into the draft; publish copies draft over published and deletes the draft | Status label **"Published, Draft"**; green/yellow status dots                                                          | **Discard changes** deletes the draft; published version untouched                                  |
| Contentful | **Same entity, explicit publish.** Saves are draft-side; publish is a separate action; CDA serves only the last published snapshot                 | Entry state **Changed**: "The entry has unpublished changes... the changes will not be shown until they are published" | Version-history rollback (whole entry or per field, with a "Show only differences" toggle)          |
| Notion     | **Live edits.** No draft concept for page content. Notion Sites propagate content edits automatically once published                               | Nothing for content. Only site _customization_ has a pending "Publish changes" state                                   | Version history → **Restore** (retention 7d free / 30d Plus / 90d Business)                         |

Notable specifics:

- **WordPress** branches explicitly in
  `WP_REST_Autosaves_Controller::create_item()`. In-place autosave requires
  all three of: status is `draft`/`auto-draft`, current user is the post
  author, and no active post lock. Otherwise it writes a per-user autosave
  revision row (`post_type = 'revision'`, `post_name = "<id>-autosave-v1"`),
  one per author, overwritten in place, skipped entirely when the diff is
  whitespace-only.
  <https://raw.githubusercontent.com/WordPress/wordpress-develop/trunk/src/wp-includes/rest-api/endpoints/class-wp-rest-autosaves-controller.php>,
  <https://raw.githubusercontent.com/WordPress/wordpress-develop/trunk/src/wp-includes/revision.php>
  Gutenberg deliberately omits `status` from the autosave payload:
  "Do not update the 'status' if we have edited it when auto saving. It's very
  important to let the user explicitly save this change."
  <https://raw.githubusercontent.com/WordPress/gutenberg/trunk/packages/core-data/src/actions.js>
  Gutenberg also keeps a browser-local (sessionStorage) autosave with its own
  notice: "The backup of this post in your browser is different from the
  version below." / **Restore the backup**.
  <https://raw.githubusercontent.com/WordPress/gutenberg/trunk/packages/editor/src/components/local-autosave-monitor/index.js>
  `Switch to draft` is deprecated as of WP 6.7; the current UI is the
  `Status & visibility` panel.
  <https://raw.githubusercontent.com/WordPress/gutenberg/trunk/packages/editor/src/components/post-status/index.js>

- **Ghost** gates autosave on draft status only:
  `get _canAutosave() { return this.post.isDraft; }`, and both the 3s debounced
  `_autosaveTask` and the 60s `_timedSaveTask` early-return otherwise.
  Statuses are exactly `draft | published | scheduled | sent` — there is no
  "published with pending edits" state. One sharp edge: leaving the editor
  force-saves regardless of status (`shouldSaveOnLeave`, comment "If leaving
  the editor, always save a revision"), which pushes edits live for a
  published post. The `Saving.../Saved` status text is rendered only for
  drafts, so a published post gives no save feedback at all.
  <https://raw.githubusercontent.com/TryGhost/Ghost/main/apps/ember-admin/app/controllers/lexical-editor.js>,
  <https://raw.githubusercontent.com/TryGhost/Ghost/main/ghost/core/core/server/data/schema/schema.js>,
  <https://raw.githubusercontent.com/TryGhost/Ghost/main/apps/ember-admin/app/components/gh-editor-post-status.hbs>

- **Sanity** drafts are authenticated-only, can only be weakly referenced, and
  can be disabled per type via `liveEdit: true` (which yields a **Live**
  status label and no draft at all). Content Releases (2024–2026) added a third
  document class `versions.<releaseId>.<docId>` layered on top of the
  drafts/published model, not replacing it.
  <https://www.sanity.io/docs/content-lake/drafts>,
  <https://www.sanity.io/docs/user-guides/history-experience>,
  <https://www.sanity.io/docs/apis-and-sdks/content-releases-cheat-sheet>

- **Contentful** state strings verbatim from
  <https://www.contentful.com/help/status/>; version snapshots are taken on
  each publish, are master-environment only, and only become available once an
  entry has been published _and then_ modified.
  <https://www.contentful.com/help/versions/>

- **Notion**: <https://www.notion.com/help/edit-and-customize-your-notion-sites>,
  <https://www.notion.com/help/duplicate-delete-and-restore-content>

**Where sources disagree / could not verify**

- Sanity is commonly described as saving "every keystroke". Sanity's own
  community answers say saves are debounced. Treat per-keystroke as inaccurate.
- Sanity's older "Changes" / "Review changes" Studio strings do not appear in
  current docs; current docs use "Published, Draft" plus History / **Compare
  versions**. Legacy, unverified against current Studio.
- Contentful: no primary source found for a literal "Discard changes" button.
  Documented revert paths are version rollback and unpublish only.
- Ghost: no evidence of any Ghost 6 draft-of-published feature; nothing in the
  6.0 changelog. Absence of evidence only.
- Ghost `post_revisions` retention rules and whether a revision is written on
  every published save could not be confirmed from source (files not locatable
  on `main`; GitHub code search returned 401).

**Pattern across all five:** every product that autosaves published content
either forks the write away from the live row (WordPress, Sanity, Contentful)
or refuses to autosave it (Ghost). Notion is the only live-edit case, and it is
not a publishing product. No researched product autosaves directly into a live
public page.

### 2. Convex: debounced autosave, reactivity, and edit loops

Verified against the installed `convex@1.42.3` and official docs.

- **`useMutation` is not bound to the component.** In
  `node_modules/convex/dist/esm/react/client.js:503`, `useMutation` returns
  `useMemo(() => createMutation(ref, convex), ...)` — the returned function
  closes over the `ConvexReactClient`, not over the component. Once a mutation
  is invoked it will complete regardless of unmount. The at-risk window is the
  debounce timer, not the in-flight request.

- **Optimistic updates cannot cause an unbounded edit loop.** Per the docs,
  optimistic updates "are run when a mutation is initiated, rerun if the local
  query results change, and rolled back when a mutation completes", and "if
  there are small mistakes in optimistic updates, the UI will always eventually
  render the correct values." The update is scoped to an in-flight mutation, so
  it terminates when the mutation resolves. It cannot re-trigger the mutation.
  <https://docs.convex.dev/client/react/optimistic-updates>

- **The real hazard is not a loop, it is a controlled-input snap-back.** If the
  editor's input `value` is bound _directly_ to `useQuery` output while a
  debounced mutation writes that same field back, the sequence
  `type → debounce fires → optimistic update applied → mutation completes →
optimistic update rolled back → server value arrives` leaves a window where
  the input renders the pre-edit server value. The docs describe exactly this
  visual artifact: "You should see a flicker as the optimistic update is
  applied and then rolled back." With continued typing during that window, the
  rolled-back value overwrites keystrokes and moves the caret. This is a
  race/flicker class of bug, not a runaway loop.
  <https://docs.convex.dev/client/react/optimistic-updates>

- **Mitigation is a local buffer, which this repo already uses.**
  `src/features/administration/service-pages-page.tsx:49-55` holds all editable
  fields in `useState` and only reads `useQuery` to seed them. As long as the
  buffer is the input's source of truth and the query result is not re-synced
  into it on every server tick, no optimistic update is needed for autosave at
  all — the local state already provides the responsiveness that optimistic
  updates exist to provide. Convex's own guidance points at buffering reactive
  values before rendering (`useBufferedState`,
  <https://stack.convex.dev/coping-with-the-web-s-looming-global-reactivity-crisis>)
  and at wrapping `useQuery` to keep stale data during refresh
  (`useStableQuery`, <https://stack.convex.dev/help-my-app-is-overreacting>).
  Caveat: both are video/demo-backed Stack posts; I could not extract a
  canonical code listing from either page, so treat them as directional, not
  as an API contract.

- **Not verified:** no official Convex doc specifically covering "debounced
  autosave" as a named pattern was found. The recommendation above is assembled
  from the optimistic-update semantics plus the reactivity-buffering posts, not
  quoted from a single authoritative page.

- **Repo-specific note:** `convex/domains/content.ts:49-79`
  (`updateServicePage`) writes an audit event on _every_ call. A debounced
  autosave at, say, 1–2s would generate an audit row per pause. That is ticket
  08's problem, recorded here as evidence for it.

### 3. React Router v8 and unmount mid-debounce

Installed: `react-router@^8.2.0`, mounted via `RouterProvider`
(`src/main.tsx:3,11`) — i.e. **data mode**, so `useBlocker` is available.

- **Yes, the write is at risk, but not because of React Router.** React Router
  does not cancel anything; the loss is the ordinary React one — the component
  unmounts, its effect cleanup clears the debounce `setTimeout`, and the
  mutation is never invoked. If the cleanup does _not_ clear the timer, the
  timer still fires and (per §2) the mutation still completes, but you have
  leaked a timer and will write after unmount with no way to surface an error
  to the user.

- **Idiomatic guard is two-layered:**
  1. **Flush, don't cancel, on unmount.** In the effect cleanup, invoke the
     pending save instead of dropping it (`debounced.flush()` for a lodash-style
     debounce, or call the mutation directly with the latest ref value). Safe
     because the mutation is client-bound, not component-bound.
  2. **`useBlocker` for the navigation itself** when you need the save to have
     _landed_ before leaving. States are `unblocked | blocked | proceeding`;
     when `blocked`, await the save then call `blocker.proceed()`.
     <https://reactrouter.com/api/hooks/useBlocker>

- **Documented limitation:** `useBlocker` "does not handle hard-reloads or
  cross-origin navigations", and is unavailable in declarative mode. Tab close
  and browser refresh still need a `beforeunload` listener, which cannot run
  async work — so a flush-on-unmount plus a short debounce interval is the
  actual protection; `beforeunload` only warns.
  <https://reactrouter.com/api/hooks/useBlocker>

- **Known sharp edge:** a naive `useBlocker(true)` blocks _every_ subsequent
  navigation. The community fix is to compare `blocker.location.pathname`
  against `useLocation()` so blocking applies only to the editor route; calling
  `proceed()` when not `blocked` throws.
  <https://github.com/remix-run/react-router/discussions/12747>

- v8.2.0 specifically added "Preserve navigation blocker state through a
  revalidation", so blocker state survives a Convex-driven revalidation in this
  version. <https://github.com/remix-run/react-router/releases>

## Answer

Prior art is one-sided: of the five products, none autosaves into a live public
page. Three fork the write (WordPress to a separate autosave revision row,
Sanity to a `drafts.<id>` document, Contentful to draft fields behind a
`Changed` state), Ghost refuses to autosave published posts at all, and Notion
is the sole live-edit case but has no publishing model. The divergence signals
range from a full status label ("Published, Draft", "Changed") down to Ghost's
single enabled Update button; revert is cheap exactly where the fork exists
(discard the draft) and expensive where it does not (Ghost: restore a revision
after the fact). Ghost is the cautionary example — its force-save-on-leave path
silently pushes edits live, and it shows no save feedback for published posts.

On Convex, a reactive `useQuery` plus an optimistic update cannot produce an
unbounded edit loop: optimistic updates are scoped to an in-flight mutation and
roll back when it completes. The real risk is a snap-back window where the
rolled-back server value overwrites in-flight keystrokes if the input is bound
directly to query output. The existing editor already avoids this by buffering
fields in `useState`, and with that buffer an optimistic update is unnecessary
for autosave. Separately, `updateServicePage` audits on every call, so debounce
interval directly sets audit volume (feeds ticket 08).

On React Router v8: nothing router-specific drops the write. `useMutation`
binds to the Convex client, not the component, so a fired mutation survives
unmount; only the pending debounce timer is lost. The guard is to flush rather
than cancel in effect cleanup, plus `useBlocker` (available here — data mode
via `RouterProvider`) scoped to the editor pathname when the save must land
before navigating. `useBlocker` does not cover refresh or tab close.

Least-verified points: Sanity's current Studio strings, whether Contentful has
a literal discard button, and Ghost's revision retention rules. No official
Convex page names "debounced autosave" as a pattern — that section is assembled
from the optimistic-update semantics plus two Stack posts.
