# Dev steps: Remove "psychiatry" from public-facing wording

Goal: the owner is not a psychiatrist. Public and patient-facing copy must
describe the practice as a medical practice focused on mental health and
addiction, never as "psychiatry", and must make no board-certification or
psychiatric-credential claim. Internal identifiers stay as they are.

Client's words: "I don't have a psych degree so it's just whole medicine with
a focus on mental health and addiction. But I can't say psychiatry even though
I've been trained in it."

## Scope

### In scope

1. Public marketing pages (`src/features/public/*`).
2. Seeded service-page content (`convex/domains/contentSeed.ts`).
3. Staff-visible UI labels that a patient could read over a shoulder or in a
   printed note: the "Initial psychiatric evaluation" heading and the
   "Psychiatric history" section label in the encounter page.
4. Docs that describe the product to the client (`docs/MENTAL_HEALTH_MEASUREMENT.md`,
   `ubiquitous-language.md`), and a `docs/CHANGELOG-CLIENT.md` entry.

### Out of scope (do not touch)

- Schema table names `psychiatricEvaluationConfigs`, `psychiatricEvaluations`,
  the module `convex/domains/psychiatricEvaluations.ts`, the section key
  `psychiatricHistory`, audit action strings, and `convex/_generated/*`.
  Renaming them is a data migration with no client-facing benefit.
- `.claude/CANYON_CREEK_SPEC.md` and `.claude/CANYON_CREEK_BLUEPRINT.md`
  (historical requirements; the root copies were already removed).
- Clinical vocabulary inside seeded service content that is about the
  condition, not the practitioner (for example "psychiatric medication" in
  Medication Management). See the wording table for the one exception.
- Any structural, layout, or route change.

## Approved replacement wording

Use these exact strings. Do not invent alternatives.

| Location                                            | Current                                                                              | Replacement                                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Home hero kicker (`home-page.tsx:114`)              | `Integrative psychiatry · addiction medicine`                                        | `Integrative medicine · mental health · addiction`                                                                        |
| Home hero body (`home-page.tsx:121-124`)            | `...combining evidence-based psychiatry, addiction medicine, and holistic health...` | `...combining evidence-based mental health care, addiction medicine, and holistic health...`                              |
| Services intro (`services-page.tsx:64`)             | `From psychiatry and medication management to...`                                    | `From mental health care and medication management to...`                                                                 |
| About body (`about-page.tsx:74`)                    | `...evidence-based psychiatry, addiction medicine, medication management...`         | `...evidence-based mental health care, addiction medicine, medication management...`                                      |
| About founder bio (`about-page.tsx:135-137`)        | `Board-certified in psychiatry with training in addiction medicine, they blend...`   | `A medical practitioner with additional training in mental health and addiction medicine, they blend...`                  |
| About team role (`about-page.tsx:28`)               | `Psychiatric Provider`                                                               | `Mental Health Provider`                                                                                                  |
| Booking service desc (`booking-page.tsx:16`)        | `Evaluation & treatment for psychiatric conditions.`                                 | `Evaluation & treatment for mental health conditions.`                                                                    |
| Booking provider role (`booking-page.tsx:49`)       | `Psychiatry & Addiction Medicine`                                                    | `Mental Health & Addiction Medicine`                                                                                      |
| Booking provider role (`booking-page.tsx:51`)       | `Psychiatric Provider`                                                               | `Mental Health Provider`                                                                                                  |
| Seed summary (`contentSeed.ts:41`)                  | `...for a wide range of psychiatric conditions.`                                     | `...for a wide range of mental health conditions.`                                                                        |
| Seed intro (`contentSeed.ts:48`)                    | `Comprehensive psychiatric evaluations and...`                                       | `Comprehensive mental health evaluations and...`                                                                          |
| Seed howItWorks (`contentSeed.ts:50`)               | `...covering your medical and psychiatric history...`                                | `...covering your medical and mental health history...`                                                                   |
| Seed Category rows (`contentSeed.ts:80,135`)        | `Psychiatric care`                                                                   | `Mental health care`                                                                                                      |
| Seed Best for (`contentSeed.ts:138`)                | `Anyone taking psychiatric medication`                                               | `Anyone taking medication for a mental health condition`                                                                  |
| Seed intro (`contentSeed.ts:103`)                   | `Psychiatric medications work best...`                                               | `Mental health medications work best...`                                                                                  |
| Seed safety note (`contentSeed.ts:326`)             | `...alongside, not instead of, conventional psychiatric care.`                       | `...alongside, not instead of, conventional mental health care.`                                                          |
| Encounter heading (`encounter-detail-page.tsx:125`) | `Initial psychiatric evaluation`                                                     | `Initial evaluation` (matches the glossary term)                                                                          |
| Encounter label (`encounter-detail-page.tsx:77`)    | `Psychiatric history`                                                                | `Mental health history`                                                                                                   |
| Sign error (`encounters.ts:274`)                    | `Required psychiatric evaluation sections are incomplete`                            | `Required evaluation sections are incomplete`                                                                             |
| Doc (`MENTAL_HEALTH_MEASUREMENT.md:17`)             | `Initial psychiatric evaluations use...`                                             | `Initial mental health evaluations (stored as psychiatricEvaluations) use...`                                             |
| Glossary (`ubiquitous-language.md:130`)             | `**Psychiatric Evaluation**:`                                                        | Rename term to `**Initial Evaluation**`, add `_Avoid_: psychiatric evaluation (in UI copy; the table name is historical)` |

Leave the "Dr. [Owner Name]" and "Founder & Medical Director" placeholders
unchanged; they are already marked as placeholders and the owner's actual
title is not known.

## Steps for the executing agent

1. Run `grep -rniE "psychiatr" src convex/domains/contentSeed.ts convex/domains/encounters.ts docs ubiquitous-language.md`
   and confirm the hit list matches the table above. If new hits exist, stop
   and report them rather than guessing wording.
2. Apply the replacements from the table with minimal edits (string-only,
   no reflow of surrounding JSX beyond what Prettier requires).
3. Do not edit `convex/schema.ts`, `convex/domains/psychiatricEvaluations.ts`,
   or anything under `convex/_generated/`.
4. Add a bullet under a new `## September 2026 Update` heading in
   `docs/CHANGELOG-CLIENT.md`, section `### Public website`:
   "Practice descriptions now say mental health and addiction medicine
   instead of psychiatry, and the founder bio no longer claims board
   certification." Add a `### Staff app` bullet for the evaluation heading.
5. Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`.
   Existing tests do not assert on this copy (verified: no `psychiatr` under
   `tests/`), so no test edits are expected. If one fails on a string, update
   the expectation string only.
6. Re-run the grep from step 1. Remaining hits must be only in the
   out-of-scope files listed above.
7. Commit as `fix(public): describe practice as mental health, not psychiatry`.

## Assumptions (confirm before executing)

- **A1: Replacement term.** "Mental health care" / "mental health" is the
  substitute for "psychiatry" and "psychiatric" in patient-facing text. The
  client said "whole medicine with a focus on mental health and addiction";
  the hero kicker reflects that phrasing directly.
- **A2: Internal names stay.** Table names, module names, section keys, and
  audit strings keep "psychiatric". No patient ever sees them.
- **A3: Staff UI heading changes.** The encounter heading and section label
  change because they can appear in printed or amended notes. If the owner
  wants the clinical document to keep its clinical name, drop those two rows.
- **A4: "Dr." stays.** The owner's actual degree is unknown. The placeholder
  remains a placeholder.

## Risks

- **R1: Already-seeded environments do not pick up seed changes.**
  `seedServicePages` skips any slug that already exists. Dev, staging, and
  production that already ran the seed keep the old published text. The fix
  is to edit the two affected service pages (Mental Health Care, Medication
  Management, Holistic & Integrative Care) in the admin content editor and
  republish. No migration is planned; that is a manual owner or developer
  step after deploy. Flag it in the PR description.
- **R2: Claude Design comps.** The design source project may still show
  "psychiatry" wording. Not part of this repo; note for the design owner.
- **R3: Truthfulness of the bio.** The replacement bio wording avoids any
  credential claim beyond "training". The owner should review the final
  sentence before launch since it still describes her.

## Acceptance criteria

- `grep -rniE "psychiatr" src convex/domains/contentSeed.ts docs ubiquitous-language.md`
  returns only `encounter-detail-page.tsx` identifier references
  (`psychiatricEvaluations`, `psychiatricHistory` key,
  `PsychiatricEvaluationEditor`, `Id<"psychiatricEvaluationConfigs">`) and the
  glossary's `_Avoid_` line and the measurement doc's parenthetical.
- No public page contains the words "psychiatry", "psychiatric", or
  "board-certified".
- The encounter page heading reads "Initial evaluation".
- Typecheck, lint, format check, and unit tests pass.
- `docs/CHANGELOG-CLIENT.md` has the new entry.

## Verification plan

1. `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`.
2. `pnpm dev`, open `/`, `/services`, `/about`, `/book` and search each page
   for "psychiat" in the browser find bar. Expect zero matches.
3. Sign in as a provider, open an encounter, confirm the evaluation heading
   and section label text.
4. Trigger the sign-with-incomplete-sections path once and confirm the error
   text no longer says "psychiatric".
5. In an environment that was seeded before this change, open the admin
   content editor for the three service pages and confirm whether the old
   text is still published (expected yes; R1).
