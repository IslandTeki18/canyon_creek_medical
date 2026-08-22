# CLAUDE.md

Clinical practice platform for an integrative mental health / addiction medicine / ketamine clinic. Greenfield — see `CANYON_CREEK_SPEC.md` (requirements) and `CANYON_CREEK_BLUEPRINT.md` (build order). No code exists yet.

## Stack

React + TypeScript (strict), Tailwind CSS, shadcn/ui, Convex, Clerk (auth), Twilio (SMS), Resend (email), Zod.

## Build order

Follow the blueprint's increments 0–14 in sequence. One blueprint task per PR. Do not start a task before its listed dependencies are done.

## Structure

- `src/features/<domain>/` — feature-oriented modules (auth, patients, intake, scheduling, encounters, medications, mat, ketamine, communications, administration)
- `src/components/`, `src/lib/`, `src/integrations/`
- `convex/` — schema.ts, domains/, integrations/, scheduledJobs.ts, lib/
- `tests/` — unit/, integration/, e2e/ (Vitest + RTL, Playwright)

## Non-negotiable rules

- **Authorization is server-side in Convex.** UI permission gates are presentation only. Every public query/mutation/action checks capability + ownership; write deny-path tests.
- **No PHI** in URLs, logs, analytics, SMS/email bodies or subjects, or filenames. Notification templates use neutral wording only ("appointment with the practice").
- **Immutable records:** signed encounter notes, consents, and published form/template versions are never edited — corrections go through amendments or new versions.
- **No autonomous clinical decisions.** The software documents and coordinates; diagnosis, medication, and eligibility decisions belong to clinicians. Risk-flagged responses create human-review tasks, nothing more.
- **Idempotency** for webhooks, reminders, and scheduled jobs (deterministic keys, replay-safe). Verify webhook signatures (Clerk, Twilio, Resend).
- **Audit events** for sensitive reads/writes, role changes, exports, overrides (with typed reason).
- **Soft-delete/archive** clinical data; never hard delete.
- **Timezone-aware** timestamps everywhere; scheduling must survive DST.
- Integrations go through adapter modules in `integrations/`; secrets only in env config, never client bundles.
- Feature flags (server-owned) gate unapproved modules (Spravato, HBOT, peptides, billing, messaging); a flag is not a substitute for authorization.
- Synthetic data only outside production.

## Definition of done (every task)

Acceptance criteria met; strict TS, lint, and tests pass; loading/empty/error/success states implemented; server-side authz + denial tests; audit events added where required; no PHI leakage; docs and env examples updated.

## Deferred (do not build yet)

Patient self-scheduling, secure messaging, billing/payments, e-prescribing, Spravato, HBOT, peptides, multi-location (keep location fields in schema).
