# Clinical record foundations

Increment 7 adds longitudinal allergies, medications, diagnoses, treatment
plans, encounter notes, amendments, and after-visit summaries.

- Patient-reported allergy and medication changes remain `pending` until a
  clinician confirms or rejects them.
- Diagnoses are clinician-authored from the temporary configured catalog;
  status changes append history rather than deleting records.
- Treatment-plan revisions create new versions. Portal queries return only
  items explicitly marked patient-visible.
- Draft encounters use an expected revision number to reject stale saves.
- Signing creates one immutable snapshot. Corrections are signed,
  append-only amendments.
- After-visit summaries are separate versioned records. Only the latest
  published, non-withdrawn version is visible in the portal.
- Clinical reads/writes, signing, amendments, publication, and withdrawal are
  enforced server-side and audited where required.

The temporary diagnosis catalog in `convex/domains/clinical.ts` must be
replaced when the practice selects an approved terminology source.
