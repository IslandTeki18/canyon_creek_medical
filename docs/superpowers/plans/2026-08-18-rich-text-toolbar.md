# Plan: Rich text toolbar (ticket 11)

Source: `docs/wayfinder/admin-content-editors/tickets/11-rich-text-editing-scope.md`

## Already done (no work)

Verified in `src/features/public/rich-text.tsx` and `render-sections.tsx`:

- `parseBody` with `##`, `###`, `>` block markers
- Inline `**bold**`, `_italic_`, `[text](url)` parsed to React nodes, no HTML
- `isAllowedHref` scheme allowlist in the renderer
- `createHeadingIds` dedup across the page (`-2`, `-3`)
- Blog TOC from all `richText` sections (`getRichTextHeadings`); service pages have no TOC

## Remaining scope

1. Toolbar over the `richText` textarea in the section canvas.
2. Link button uses a dialog, not `window.prompt`.
3. Skipped heading level (`###` with no prior `##`) surfaced as a warning.

## Steps

### 1. Marker helpers (pure functions)

New file `src/components/ui/rich-text-toolbar.tsx`, exporting pure helpers so
the textarea logic is testable without a DOM:

- `applyInline(text, selStart, selEnd, open, close)` — wraps selection with
  `open`/`close`; on empty selection inserts `open + close` and places the
  caret between. Returns `{ text, selStart, selEnd }`.
- `toggleBlockPrefix(text, caret, prefix)` — finds the block (blank-line
  delimited, same split as `parseBody`) containing the caret; if the block
  already starts with `prefix`, removes it; otherwise strips any other block
  prefix (`## `, `### `, `> `) and prepends `prefix`. Returns new text and
  caret shifted by the delta.
- `applyLink(text, selStart, selEnd, url)` — `[selection](url)`; empty
  selection uses `[link text](url)` with `link text` selected.

### 2. `RichTextToolbar` component

Same file. Props: `textareaRef`, `value`, `onChange(text)`.
Six buttons: Heading, Subheading, Quote, Bold, Italic, Link. Each button:
reads `selectionStart/End` from the ref, calls the helper, calls `onChange`,
then in `requestAnimationFrame` sets `setSelectionRange` and `focus()`.
Buttons use `type="button"` and `onMouseDown={e => e.preventDefault()}` so
the textarea keeps its selection.

Link button opens a small dialog built on the existing
`src/components/ui/dialog.tsx` with one URL input (mirrors `ReasonDialog`
shape; do not reuse `ReasonDialog` itself since its copy and destructive
styling are wrong for this). No URL validation in the editor — the renderer
allowlist is the guard, per ticket.

### 3. Wire into the canvas

`src/components/ui/section-canvas.tsx` `SectionFields` case `"richText"`:
render `RichTextToolbar` above the textarea. `TextArea` in `field.tsx` does
not accept a ref; add an optional `textareaRef` prop (one-line change) rather
than duplicating the textarea. Update the hint text to drop "type ## / >"
wording (the toolbar does it), keep a short note that markers are visible and
editable.

### 4. Skipped heading level warning

Ticket says "warning, not block" on the publish problems list. That list is
populated only from server zod issues on a failed publish
(`convex/lib/content.ts:134`), so a non-blocking entry does not fit that
channel without new plumbing. Cheapest faithful alternative: an inline
`role="status"` note under the richText textarea when
`parseBody(section.text)` contains a `subheading` before any `heading` in
the section. Scope is per section, not whole page (whole-page requires
threading all sections into `SectionFields`; flagged below as a deliberate
simplification with a `ponytail:` comment).

## Files likely to change

| File                                      | Change                                    |
| ----------------------------------------- | ----------------------------------------- |
| `src/components/ui/rich-text-toolbar.tsx` | new: helpers + toolbar + link dialog      |
| `src/components/ui/section-canvas.tsx`    | render toolbar + warning in richText case |
| `src/components/ui/field.tsx`             | optional `textareaRef` on `TextArea`      |

No Convex, schema, migration, or public-renderer changes.

## Assumptions and risks

- Assumes `dialog.tsx` (shadcn/radix) is the intended dialog primitive per
  ticket 05; confirmed present.
- Heading warning is per section and inline, not on the publish panel and not
  page-wide. Deviation from ticket wording; stated above.
- Selection restore after React re-render relies on `requestAnimationFrame`;
  if the canvas remounts the textarea on change, focus is lost. Verify in
  step 3; fall back to `useLayoutEffect` keyed on a pending-selection state.
- Toggling a block prefix on the block under the caret when the selection
  spans multiple blocks: only the block containing `selectionStart` is
  affected. Accepted.

## Acceptance criteria

- Six toolbar buttons appear above every `richText` textarea in both editors.
- Bold/Italic/Link wrap the selection or insert an empty pair at the caret;
  focus and a sensible selection are restored afterwards.
- Heading/Subheading/Quote toggle the prefix on the caret's block and replace
  a different existing prefix rather than stacking.
- Link opens a dialog, never `window.prompt`; Cancel leaves text unchanged.
- Resulting text renders correctly on the public page with no renderer change.
- A `###` before any `##` in a section shows an inline warning and does not
  block autosave or publish.
- Strict TS and lint pass.

## Verification plan

1. `pnpm typecheck && pnpm lint`.
2. Manual, in the service page editor and blog editor:
   - select a word, click Bold → `**word**`, selection stays on `word`
   - empty caret, click Italic → `__` with caret between
   - caret in a paragraph, click Heading → `## ` prefix; click again → removed;
     click Quote → `> ` replaces `## `
   - Link with selection → dialog → `[sel](url)`; Cancel → unchanged
   - `###` before `##` → warning visible; publish still works
3. Open the public page (View as visitor / published) and confirm headings,
   quote, bold, italic, link render and a `javascript:` URL renders as text.
