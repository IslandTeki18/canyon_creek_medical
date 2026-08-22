---
title: What gets tested, and at which level
map: ../MAP.md
type: wayfinder:grilling
status: closed
closed: 2026-08-22
assignee: Landon McKell
blocked-by: []
---

## Question

Graduated from the map's **Testing strategy** fog, which was held because
autosave and the canvas were both unspecified. Both are now specified —
[Autosave frequency and audit noise](08-autosave-audit-noise.md) pins the
timing table, coalescing rule, retry backoff and navigation blocker, and
[Section canvas interaction](03-wizard-step-breakdown.md) pins add, reorder and
the six-second undo toast — so the question of what to test is now statable.

The repo has `tests/unit/`, `tests/integration/` and `tests/e2e/`
(Vitest + RTL, Playwright), and `CLAUDE.md`'s definition of done requires
server-side authz plus denial tests on every task.

- **Where does the autosave state machine get tested?** Debounce, the 10s hard
  flush, one-in-flight-plus-one-queued coalescing, flush-on-unmount and the
  backoff ladder are all timer-driven. Vitest fake timers can drive every one
  of them without a browser — but the thing that actually breaks in production
  is the interaction with real navigation, which fake timers cannot reach.
  Where is the line?
- **`useBlocker` and `beforeunload` are untestable in RTL.** They need a real
  router and a real browser. Is that one Playwright spec, or is it accepted as
  uncovered?
- **Which denial tests are mandatory?** `saveDraft` is a new unaudited
  mutation, `generateContentImageUploadUrl` is capability-discriminated by
  target ([Images inside sections](12-images-inside-sections.md)), and
  [Previewing an unpublished draft](13-draft-preview.md) already requires deny
  tests plus an entry in `tests/unit/data-exposure.test.ts`. Is there a single
  checklist these all belong to?
- **The publish gate is the highest-value pure function in the effort.** It
  decides alt text, safety note, strict schema and storage-id revalidation. It
  is pure input-to-problems, so it is cheap to table-test exhaustively. Is that
  the one place thoroughness is spent?
- **Section reorder by drag.** Drag is expensive to test and the arrow-button
  path is trivial to test. Since both produce the same mutation, is testing the
  buttons sufficient coverage of reordering, with drag covered once end to end?
- **The migration script** converts six seeded service pages and every blog
  post. It runs once and is unrecoverable if wrong. What proves it correct
  before it runs?
- **What is deliberately not tested?** Naming this explicitly is worth as much
  as the coverage, and keeps the definition of done honest rather than
  aspirational.

## Answer

### Autosave state machine

Test timer-driven autosave rules at hook level in
`tests/unit/use-autosave.test.tsx` with Vitest fake timers. Editor pages do not
repeat those cases. Retry/backoff joins these tests when ticket 08's deferred
implementation lands.

### Navigation guards

`useBlocker` and `beforeunload` are already covered in RTL with a memory router.
The current Playwright harness cannot reach authenticated admin routes, so real
browser navigation and unload remain uncovered.

### Denial checklist

Keep one named denial test per mutation or getter in its existing domain test:
`saveServicePageDraft`, `savePostDraft`, target-specific
`generateContentImageUploadUrl`, `getServicePage`, and `getPost`. Preview
payloads also get an allowlist assertion in `data-exposure.test.ts`. The
definition of done in `CLAUDE.md` remains the checklist; no new checklist file.

### Publish gate

Table-test strict service content parsing and image validation as pure
functions, then use one Convex test per content type where storage-id
revalidation requires the database.

### Section reorder

Test arrow-button reorder plus delete and undo in RTL. Arrow and drag paths
produce the same `onChange`, so drag remains uncovered until authenticated e2e
coverage exists.

### Migration proof

Export and table-test the pure service and blog converters against the seeded
legacy shapes. Run the Convex migration twice to prove idempotency, and require
every migrated row to pass its strict publish parser.

### Deliberately not tested

- Drag reorder.
- Real-browser navigation and unload.
- Retry backoff until its implementation lands.
- Relative-timestamp re-render cadence.
- Visual layout.
