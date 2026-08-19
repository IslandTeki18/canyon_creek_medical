---
title: Partial drafts versus schema validation
map: ../MAP.md
type: wayfinder:grilling
status: closed
closed: 2026-08-05
assignee: Landon McKell
blocked-by: []
---

## Question

`convex/lib/content.ts` zod-validates `ServicePageContent` on every write, and
the current form marks essentially every field `required`. Autosave means the
server must accept a page whose title is three characters and whose steps are
empty — a state today's validator rejects.

Where does validation move to, and what is the contract?

- Does a draft validate against a loose schema (all fields optional) and the
  strict schema only run at publish time?
- If so, what does the founder see for a draft that cannot yet be published —
  a checklist of what is missing, a disabled publish button, or both?
- Does the same split apply to blog posts, which have their own validation?
- The repo forbids autonomous clinical decisions and requires no PHI in public
  content. Does any content validation need to stay strict even for drafts?

Resolving this defines the server-side shape autosave writes against.

## Narrowed by ticket 01

[Draft autosave on published content](01-autosave-published-content.md)
settled where the draft lives, which answers part of this question and
sharpens the rest:

- `content` keeps its **strict** validation, because only publish writes it.
  `parseServicePageContent` moves from the update mutation to the publish
  mutation and becomes the publish gate.
- `draftContent` is what needs the **loose** schema. Open: is it "same shape,
  every field optional", or genuinely unvalidated `v.any()` on write? A loose
  zod schema still catches a client sending garbage; `v.any()` catches nothing.
- `content` becomes **optional** on both tables, since a never-published page
  has no published version. Confirm no code path reads `content` on a
  non-published row.

Still fully open: what the founder sees when a draft cannot yet be published.
The strict parse produces zod issues with field paths — do those become a
readable checklist ("Summary is missing"), and does the wizard show which step
each problem lives in?

## Answer

Combines the two decisions recorded below (one schema factory; a checklist
publish gate) with the three settled here.

### Drafts are structurally validated, emptiness allowed

`draftContent` is parsed on every autosave against the **loose** mode of the
schema factory. Structure is enforced; incompleteness is not.

```
OK    { type: "richText", id: "s1", text: "" }
OK    { type: "numberedSteps", id: "s2", steps: [] }

FAIL  { type: "iframe", ... }          unknown section type
FAIL  { type: "richText", txt: "hi" }  unknown field (schema is .strict())
FAIL  "just a string"                  not a section
```

Rejected: storing `draftContent` as unvalidated `v.any()`. A half-finished
sentence must never be rejected, but an unknown section type or a stray field
is a client bug or an attack, and the row is the thing the public page is
eventually rendered from. Structural validation costs nothing at authoring
time because the editor can only ever produce known types.

### Strict validation runs at publish, as a checklist

`content` keeps the strict schema, and the strict parse moves out of the
update mutation into publish, where it becomes the gate.

Publish stays **always clickable**. If the draft is incomplete, the founder
gets a panel listing every problem — zod issues carry field paths, so each
entry names the field and links to the section that owns it — rather than one
error at a time or a disabled button with no stated cause. Nobody is shown
errors while still writing; they appear only when they try to go live.

Rejected: a persistent panel, which opens a brand new page covered in
red; and a disabled Publish, which is the classic "why can't I click this"
complaint.

### Cards read the draft first

With `content` optional, a never-published page has only `draftContent`. Cards
and lists resolve display fields as `draftContent ?? content`, so the founder
always sees their latest words. Consequence to keep in mind: a retitled but
unpublished page shows its new title in the admin list while visitors still
see the old one — which the **Live · edited** badge already explains.

### Schema changes

- `content` becomes optional on `servicePages` and `blogPosts`.
- `draftContent` added as an optional field on both.
- Confirm during the build that no code path reads `content` on a
  non-published row. `toPublicServicePage` is only reached for published
  rows; `listServicePages` returns whole rows to the admin, which is where the
  `draftContent ?? content` fallback applies.

## Unblocked

[Section-based content model](10-section-based-content-model.md) resolved, so
the shape being validated is now known: fixed metadata fields plus a
`sections` discriminated-union array over six types. The factory applies per
section type, and the publish gate resolves a zod issue path to a specific
section rather than a wizard step. Also settled there: `safetyNote` is a fixed
field the publish gate must require.

## Partial decisions, made before ticket 10

Two answers were given while working this ticket. Both survive a move to
section-based content, but neither can be finalised until
[Section-based content model](10-section-based-content-model.md) settles what
is being validated. This ticket is blocked on that.

**Strict and loose come from one schema factory.** The shape is defined once,
parameterised by the string rule, so the two modes cannot drift apart:

```ts
const shape = (s: z.ZodString, min: 0 | 1) =>
  z
    .object({
      title: s,
      icon: s,
      summary: s,
      steps: z.array(z.object({ title: s, body: s })).min(min),
      // ...
    })
    .strict();

export const servicePageContentSchema = shape(nonEmpty, 1); // publish gate
export const servicePageDraftSchema = shape(z.string(), 0); // autosave
```

Chosen over a hand-written second schema (drifts) and over unvalidated
`v.any()` (a client could write arbitrary shapes into the row). Note zod is
v4.4.3, which removed `deepPartial`, so `.partial()` alone cannot loosen the
nested array item schemas — hence the factory.

Under a section model the factory applies per section type, and `content`
becomes a discriminated union array. The principle holds; the shape does not.

**The publish gate is a checklist naming each missing item.** Zod issues carry
field paths, so failures render as "Summary is missing", "Step 2 needs a
title", each linking to wherever that field lives in the editor — rather than
a bare disabled button or today's first-error-only message. Under a section
model the path resolves to a section rather than a wizard step.
