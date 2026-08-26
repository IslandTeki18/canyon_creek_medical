# Dev steps: Form template editor

Goal: replace the JSON textarea in `/admin/forms/:templateId` with a
structured section-and-field builder the owner can use unassisted, reusing
the editor primitives already built for service pages and blog posts.

## Current state

- `src/features/administration/form-template-detail-page.tsx`: header
  (retire/restore via `ReasonDialog`), version history table, and a
  `DraftEditor` that is a JSON `<textarea>` with Save draft, Publish (alert
  dialog), and a live `FormRenderer` preview. Marked
  `ponytail: JSON textarea instead of a drag-and-drop builder`.
- `src/features/administration/form-templates-page.tsx`: name/type/status
  table, create form, assignment rules table. No browser prompts remain.
- Model (`convex/lib/forms.ts`): `sections[] { title, content?, fields[] }`,
  seven field types (`text`, `textarea`, `number`, `date`, `select`,
  `multiselect`, `checkbox`), per-field `key`, `required`, `helpText`,
  `options`, `min/max/maxLength`, `showIf { fieldKey, equals }`, optional
  `scoreRule { type: "sum", fields }`. Strict zod schema only; `parseDefinition`
  throws on any problem.
- Versions (`convex/domains/forms.ts`): a draft is its own `formVersions` row,
  so the draft/published invariant already exists. `updateDraftVersion`
  validates strictly and writes an audit event on every save.
- Reusable primitives: `EditorShell`, `RailGroup`, `TextField`, `TextArea`,
  `AddRow`, `RemoveRow`, `NameDialog`, `ReasonDialog`, `Toast`,
  `useAutosave` + `AutosaveStatus` + `AutosaveBanner`, `SectionCanvas`
  (content sections only; its move/insert/undo mechanics are the model to
  copy, not the component to reuse).

## Design decisions

| Decision               | Choice                                                                                                            | Why                                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Draft validation       | Add a loose schema for drafts; keep strict at publish                                                             | Ticket 02 pattern. A half-built field (no label yet) must still autosave.                                                                        |
| Field key              | Derived from the label (slugified, deduped), shown read-only under "Advanced"                                     | Owner never invents identifiers. Keys are stable once set: derive on create only, never re-derive on label edit, since responses reference keys. |
| Autosave               | `useAutosave` writing a new `saveDraftDefinition` mutation (no audit event, stamps `updatedAt`)                   | Ticket 08: audit noise. `updateDraftVersion` stays for the audited path and tests.                                                               |
| Layout                 | `EditorShell`: rail = template name/type, scoring, status; main = sections list; preview stays below the sections | Same shape as the other editors.                                                                                                                 |
| Reorder                | Move up/down buttons for sections and fields; no drag in v1                                                       | Keyboard access for free, smaller diff. Add drag later if asked.                                                                                 |
| Delete                 | Immediate with six-second undo toast (`Toast`)                                                                    | Matches section canvas decision.                                                                                                                 |
| Conditional visibility | A "Only show when" row: pick an earlier field (select/checkbox only), pick a value                                | Covers the single-condition model exactly; no expression UI.                                                                                     |
| Scoring                | Rail group "Scoring": toggle "Add up number fields" + checklist of number fields                                  | Maps 1:1 to `scoreRule`.                                                                                                                         |
| Publish gate           | Publish stays clickable; dialog lists every strict-validation problem linked to the owning section/field          | Ticket 02 pattern.                                                                                                                               |
| Escape hatch           | Keep a collapsed `<details>` "Edit as JSON" under Advanced                                                        | Zero cost, keeps the existing tests and power-user path.                                                                                         |

## Steps

### 1. Loose draft schema (`convex/lib/forms.ts`)

- Refactor `fieldSchema` / `sectionSchema` / `formDefinitionSchema` into a
  factory `formSchema(mode: "strict" | "draft")` mirroring
  `blogPostSchema(requiredText, ...)` in `convex/lib/content.ts`.
- Draft mode: labels may be empty, `options` may be empty, `showIf` may
  reference a missing key, `sections` may be empty, score fields may be
  unresolved. Structural rules stay (field type enum, key regex, limits,
  duplicate keys).
- Export `formDefinitionSchema` (strict, unchanged name) and
  `formDraftSchema`; add `listDefinitionProblems(def): { path, message }[]`
  returning strict issues with a section/field path for the publish dialog.
- Add `deriveFieldKey(label, taken: Set<string>)`: slugify to the key regex,
  suffix `_2`, `_3` on collision.

### 2. Draft autosave mutation (`convex/domains/forms.ts`)

- Add `saveDraftDefinition({ versionId, definition })`: `form.manage`,
  draft-only, parses with `formDraftSchema`, patches `definition` +
  `updatedAt`, no audit.
- `publishVersion`: parse the stored definition with the strict schema before
  publishing (today it trusts the row).
- `createDraftVersion` default definition becomes `{ sections: [] }` under
  the draft schema so a new draft opens empty.

### 3. Builder state helpers (`src/features/administration/form-builder.ts`, new)

Pure functions over `FormDefinition`, no React:
`addSection`, `removeSection`, `moveSection`, `updateSection`,
`addField(sectionIndex, type)` (derives key), `removeField`, `moveField`,
`updateField`, `fieldsBefore(def, sectionIndex, fieldIndex)` (candidates for
"Only show when"), `numberFields(def)`.

### 4. Builder UI (`src/features/administration/form-builder.tsx`, new)

- `FormBuilder({ definition, onChange(next, structural) })`.
- Section card: title `TextField`, optional intro `TextArea` ("Text shown
  above the questions"), fields list, `AddRow` "Add question" opening a
  type menu with plain labels (Short answer, Long answer, Number, Date,
  Choose one, Choose many, Yes/no), Move up/down, Remove.
- Field row: label, Required checkbox, Help text; type-specific: options
  editor (label only; `value` mirrors label) for choose-one/many, min/max
  for number, max length for text/long answer; "Only show when" row;
  Advanced `<details>` showing the derived key read-only.
- Remove (section or field) applies immediately and shows the undo `Toast`.

### 5. Wire the detail page (`form-template-detail-page.tsx`)

- Replace `DraftEditor` internals: local `definition` state seeded from the
  draft row, `useAutosave({ value: definition, save: saveDraftDefinition })`,
  `AutosaveStatus` in the top bar, `AutosaveBanner` on failure.
- `EditorShell`: rail = "Template" group (name, type, status, retire/restore
  as today), "Scoring" group; main = `FormBuilder`, then "Preview" using
  `FormRenderer` on the current draft (unchanged component).
- Publish button: flush autosave, compute `listDefinitionProblems`; if any,
  the dialog lists them with anchor links to the owning section and no
  Publish action; otherwise the existing summary + Publish version.
- Advanced `<details>` "Edit as JSON": the existing textarea, applying on
  blur through the same `onChange`.

### 6. List page polish (`form-templates-page.tsx`)

- Create form becomes `NameDialog` (name + type) and navigates straight to
  the new draft, matching the "named first" decision.
- Column labels in plain language: Type shows "Intake form" / "Consent" /
  "Assessment".

### 7. Docs

- `docs/ADMINISTRATION.md` forms section: builder, autosave, derived keys,
  publish gate, JSON escape hatch.
- Remove the `ponytail:` comment from the detail page.

## Files likely to change

| File                                                        | Change                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| `convex/lib/forms.ts`                                       | schema factory, draft schema, problems list, key derivation         |
| `convex/domains/forms.ts`                                   | `saveDraftDefinition`, strict check at publish, empty default draft |
| `src/features/administration/form-builder.ts`               | new: pure state helpers                                             |
| `src/features/administration/form-builder.tsx`              | new: builder UI                                                     |
| `src/features/administration/form-template-detail-page.tsx` | editor shell, autosave, publish gate, JSON fallback                 |
| `src/features/administration/form-templates-page.tsx`       | name dialog, labels                                                 |
| `docs/ADMINISTRATION.md`                                    | forms section                                                       |

Unchanged: `schema.ts` (definition is already `v.any()`), `FormRenderer`,
assignments, portal form fill.

## Assumptions

1. Field keys are immutable after creation. Renaming a label does not rename
   the key; existing responses keep working.
2. Option `value` equals option label. The model allows them to differ, the
   owner never needs that.
3. `showIf` targets are limited to select and checkbox fields that appear
   earlier in the form. The model allows any field; the UI narrows it.
4. Draft autosave is last-write-wins, as on the other editors.
5. No drag reorder in v1.

## Risks

- Existing unit tests around `parseDefinition` and `updateDraftVersion`
  keep passing (strict path untouched); new draft-mode tests are owed.
- A draft saved under the loose schema can no longer be published until
  fixed; the publish dialog must make every problem findable, or the owner
  is stuck.
- Key derivation from non-ASCII labels can yield an empty slug; fall back
  to `field_<n>`.
- Assessment templates with `scoreRule` authored by developers may use
  keys the derivation would never produce; the read-only key display keeps
  them visible.

## Acceptance criteria

- The owner can create a template, add sections and questions of every
  type, set required/help/options/conditions, reorder, delete with undo,
  and see the patient preview update, without typing JSON.
- Edits autosave with "Saved just now" and no audit events; structural
  edits save immediately.
- Publish on an incomplete draft lists each problem with a link to it and
  does not publish; a complete draft publishes and the version becomes
  immutable.
- The JSON editor under Advanced still round-trips the same definition.
- Retire/restore, version history, assignment rules unchanged.
- `npm run typecheck`, lint, and existing tests pass.

## Verification plan

1. Create "Test intake" via the name dialog; confirm redirect to an empty
   draft.
2. Add two sections, one of each question type; reload mid-edit and confirm
   the draft persisted (autosave).
3. Set a "Choose one" field, then a later text field shown only when it
   equals an option; confirm the preview hides/shows it.
4. Remove a section, click Undo within six seconds; confirm it returns.
5. Click Publish with an unlabeled question: dialog lists the problem,
   link focuses the field. Fix it, publish, confirm version 1 is published
   and the builder is read-only until "New draft".
6. Open `/admin/audit`: draft saves produced no events; publish did.
7. Open Advanced > Edit as JSON, change a label, blur; builder reflects it.
