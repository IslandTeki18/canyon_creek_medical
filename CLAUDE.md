# CLAUDE.md

Clinical practice platform for an integrative mental health / addiction medicine / ketamine clinic. See `CANYON_CREEK_SPEC.md` (requirements), `CANYON_CREEK_BLUEPRINT.md` (build order), and `README.md` (setup, scripts, layout, status).

## Stack

React 19 + TypeScript (strict), Vite, React Router, Tailwind CSS 4, shadcn/ui, Convex, Clerk (auth), Twilio (SMS), Resend (email), Zod. pnpm only. Lint is oxlint, tests are Vitest + RTL + convex-test, e2e is Playwright.

## Build order

Increments 0–12 are done; 13 is documented with sign-offs pending; 14 not started. Remaining blueprint work follows the blueprint in sequence, one task per PR, dependencies first. Post-blueprint work (admin editors, form builder, feature simplification) is planned in `docs/superpowers/plans/` and tracked in `docs/wayfinder/`.

## Commands

`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm e2e`. The pre-commit hook runs the first four; CI runs all plus build. Run them before claiming a task done.

## Structure

- `src/routes.tsx` — route tree; groups are `/` (public), `/portal` (patients), `/app` (staff), `/admin`
- `src/features/<domain>/` — page components (auth, public, portal, patients, intake, scheduling, clinical, communications, administration)
- `src/components/` (app shell, `ui/` shadcn), `src/lib/` (auth, feature gates, permission gate)
- `convex/` — schema.ts, domains/ (one file per domain), lib/ (access, audit, permissions, time), integrations/ (twilio, resend), http.ts (webhooks), scheduledJobs.ts, migrations/
- `tests/` — unit/ (Vitest, RTL, convex-test), e2e/ (Playwright + axe), fixtures/ (synthetic builders)
- Client-side changes that users see get a note in `docs/CHANGELOG-CLIENT.md`.

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
