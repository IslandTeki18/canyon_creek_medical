---
title: Replacing the browser prompts
map: ../MAP.md
type: wayfinder:grilling
status: closed
closed: 2026-08-05
assignee: Landon McKell
blocked-by: []
---

## Question

Four `window.prompt` and `window.confirm` calls stand between the founder and
a professional-feeling admin: archive reason on service pages and blog posts,
and on the service catalog a status-change reason plus a `window.confirm` that
decides whether future appointments get cancelled.

- What replaces them? `src/components/ui` currently holds only `button.tsx`,
  so a dialog primitive must be chosen and added (shadcn dialog / alert
  dialog over the already-installed `radix-ui`).
- The catalog confirm encodes a genuinely consequential choice — cancel
  affected appointments or keep them and stop new bookings. A two-button OK
  and Cancel misrepresents it. What does that dialog actually say?
- Archive reasons are typed and stored for audit. Does the dialog offer preset
  reasons, free text, or both?
- Accessibility: focus trapping, escape to dismiss, and the destructive action
  never being the default focus.

Resolving this covers all four editors at once.

A fifth consumer arrived from
[What a rich text section can do](11-rich-text-editing-scope.md): the rich-text
toolbar's **Link** button needs a small prompt-for-a-URL dialog. Unlike the
other four it is not destructive and has no audit reason — so whatever is
chosen here must cover a plain single-input dialog, not only confirm-with-
reason.

## Answer

**Add shadcn `dialog` and `alert-dialog` to `src/components/ui`, over the
already-installed `radix-ui`. Convert the four content-editor files; leave the
rest of the app alone.** No new dependency.

### The call sites are six, not four

Grounding the ticket corrected its own premise:

| File                            | Line | Call                  | Becomes            |
| ------------------------------- | ---- | --------------------- | ------------------ |
| `blog-posts-page.tsx`           | 180  | archive reason        | reason dialog      |
| `service-pages-page.tsx`        | 133  | archive reason        | reason dialog      |
| `service-catalog-page.tsx`      | 23   | status-change reason  | reason dialog      |
| `service-catalog-page.tsx`      | 38   | migration `confirm`   | choice dialog      |
| `form-template-detail-page.tsx` | 84   | retire/restore reason | reason dialog      |
| `form-template-detail-page.tsx` | 192  | publish `confirm`     | consequence dialog |

Plus the URL dialog for the rich-text Link button
([What a rich text section can do](11-rich-text-editing-scope.md)) — seven.

### Scope: the primitive is repo-wide, the conversion is not

There are roughly **29 further `window.prompt` calls** outside this map — in
`features/patients`, `features/scheduling`, `features/clinical`,
`features/communications`, `features/portal` and `reports-page.tsx`. They are
the same smell and they are **not converted here**. This map's destination is
the content editors; dragging the patient chart and the ketamine session page
into it would swap a clear destination for a repo-wide sweep with its own
reason semantics per surface.

What this effort owes them is the primitive: the dialog lands in
`src/components/ui` general enough to adopt, so the sweep is later a
mechanical follow-up rather than a design exercise. **Record that follow-up on
the map's Out of scope section**, so it is visibly deferred rather than
forgotten.

### Reasons stay free text

One textarea. `reason` remains `v.string()`, trimmed and required server-side
(`convex/domains/content.ts:131`), so **no schema change and no server
change** — this is purely a client swap, which is why it is safe to do
alongside the editor rework.

Preset reason lists were rejected: they buy queryable audit data at the cost
of a list per surface that has to stay honest, and a founder facing a case the
list misses picks the nearest wrong preset — worse audit data than prose. If
audit querying is ever wanted, the presets can be added later without
invalidating stored free text, since `reason` stays a string either way.

The dialog's submit button is disabled while the reason is empty or
whitespace. The **server check stays regardless** — the disabled button is
presentation, the trust boundary is the mutation.

### The two consequential dialogs

**Catalog migration** (`service-catalog-page.tsx:38`). An `AlertDialog` that
states the count — "N future appointments use this service" — with two named
action buttons:

- **Cancel those appointments**
- **Keep them, stop new bookings**

plus **Back**. Each button names its own outcome, so nothing depends on the
founder working out which one OK meant. The destructive button is styled
destructive and is **not** the default focus; Escape and Back both mean
neither. This keeps the existing two-step flow — attempt, catch the server's
`choose a migration` error, re-ask with `migration` set — because the server
is the authority on whether a migration is needed and the catalog's flow is
otherwise out of scope.

**Form template publish** (`form-template-detail-page.tsx:192`). An
`AlertDialog` whose body carries the existing `summarize(def)` line and states
the consequence plainly: the published version becomes immutable and is used
for all new assignments. Confirm button reads **Publish version**, not OK. No
type-the-name-to-confirm ceremony — the action is intended and reversible by
publishing a new version, just not by editing this one.

### Shape of the code

Two shadcn primitives (`dialog`, `alert-dialog`) plus **one** thin wrapper,
`ReasonDialog`, since four of the seven sites are the same shape: title, one
textarea, Cancel, a named confirm. The other three are written out at their
call sites against the primitives directly.

Explicitly rejected: an imperative `useConfirm()` / `showDialog()` helper
returning a promise. It reads well at the call site and then owns global
state, focus restoration and unmount ordering — the exact machinery Radix
already handles declaratively.

### Accessibility

Radix `Dialog`/`AlertDialog` supply the focus trap, Escape-to-dismiss, focus
restoration to the trigger, and `aria-modal` wiring. What the build must add:

- `AlertDialogAction` for destructive choices never receives initial focus
  (point Radix's initial focus at Cancel or Back).
- Every dialog has a `Title`, and a `Description` where the consequence needs
  stating — Radix warns on a missing description, and the warning is right.
- The reason textarea carries a real `<label>`, not a placeholder.
- Error text from a failed mutation renders inside the dialog with
  `role="alert"` and the dialog stays open, rather than closing and stranding
  the message on the page behind it.
- Covered by the existing `@axe-core/playwright` setup.
