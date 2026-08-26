# Canyon Creek

Clinical practice platform for an integrative mental health, addiction medicine, and ketamine clinic. Covers the public site, patient portal, staff clinical app, and practice administration.

Requirements live in `CANYON_CREEK_SPEC.md`; build order in `CANYON_CREEK_BLUEPRINT.md`. Agent and contributor rules are in `CLAUDE.md`.

## Stack

| Layer      | Choice                                                        |
| ---------- | ------------------------------------------------------------- |
| Frontend   | React 19, TypeScript (strict), Vite, React Router             |
| UI         | Tailwind CSS 4, shadcn/ui (radix-nova), lucide                |
| Backend    | Convex (schema, queries, mutations, cron jobs)                |
| Auth       | Clerk (webhooks via svix)                                     |
| Messaging  | Twilio (SMS), Resend (email)                                  |
| Validation | Zod                                                           |
| Quality    | oxlint, Prettier, Vitest + RTL, convex-test, Playwright + axe |

## Prerequisites

- Node 22
- pnpm 11 (`corepack enable`)
- A Convex account and a Clerk application (dev instances are fine)

## Setup

```sh
pnpm install                # also installs the git pre-commit hook
cp .env.example .env.local  # fill in names listed there; never commit values
pnpm dev:convex             # first run creates a dev deployment and sets CONVEX_DEPLOYMENT / VITE_CONVEX_URL
pnpm dev                    # Vite on http://localhost:5173
```

Clerk, Twilio, and Resend server-side keys are set as Convex deployment environment variables, not in `.env.local`. See `docs/ENVIRONMENTS.md` for which environment gets which credentials. Twilio and Resend are intentionally absent locally and in preview.

## Scripts

| Script            | Purpose                                       |
| ----------------- | --------------------------------------------- |
| `pnpm dev`        | Vite dev server                               |
| `pnpm dev:convex` | Convex dev deployment with live function push |
| `pnpm typecheck`  | `tsc -b --noEmit`                             |
| `pnpm lint`       | oxlint                                        |
| `pnpm format`     | Prettier write (`format:check` to verify)     |
| `pnpm test`       | Vitest unit and Convex function tests         |
| `pnpm e2e`        | Playwright smoke and accessibility specs      |
| `pnpm build`      | Typecheck and production bundle               |

The pre-commit hook (`.githooks/pre-commit`) runs typecheck, lint, format check, and tests. CI (`.github/workflows/ci.yml`) runs the same plus build and Playwright.

## Repository layout

```
convex/
  schema.ts          all tables and indexes
  domains/           one module per domain (patients, scheduling, forms, encounters, mat, ketamine, ...)
  lib/               shared server helpers (access, audit, permissions, time, slots, ...)
  integrations/      Twilio and Resend adapters; secrets only here
  http.ts            webhook endpoints (signature-verified)
  scheduledJobs.ts   cron entry points (idempotent)
  migrations/        one-off data migrations
src/
  routes.tsx         route tree: public site, /portal, /app (staff), /admin
  features/<domain>/ page components per domain
  components/        app shell, shadcn/ui primitives
  lib/               auth, feature gates, permission gate (presentation only)
tests/
  unit/              Vitest, RTL, convex-test (authorization matrix, deny paths, domain logic)
  e2e/               Playwright smoke and axe accessibility
  fixtures/          synthetic data builders
docs/                operational and compliance docs (see below)
```

## Route groups

| Prefix    | Audience       | Auth                                   |
| --------- | -------------- | -------------------------------------- |
| `/`       | Public site    | None                                   |
| `/portal` | Patients       | Clerk account linked to a patient      |
| `/app`    | Clinical staff | Clerk account with workforce role      |
| `/admin`  | Administrators | Workforce role with admin capabilities |

Authorization is enforced in Convex on every public function. Client-side gates only hide UI.

## Status

Blueprint increments 0 through 12 are implemented (delivery foundation, identity, patients, portal, forms and intake, scheduling, communications, clinical chart, measurement, MAT, ketamine, tasks/files/alerts, administration and reporting). Increment 13 (security hardening) has its documentation and tests in place; launch sign-offs in `docs/LAUNCH_READINESS.md` are pending. Increment 14 (pilot and production launch) has not started.

Deferred by design: patient self-scheduling, secure messaging, billing, e-prescribing, Spravato, HBOT, peptides, multi-location.

## Documentation

| Doc                                 | Content                                        |
| ----------------------------------- | ---------------------------------------------- |
| `docs/ENVIRONMENTS.md`              | Local, preview, staging, production separation |
| `docs/OBSERVABILITY.md`             | Logging and health checks (no PHI in logs)     |
| `docs/SESSION_SECURITY.md`          | Session and idle controls                      |
| `docs/DATA_EXPOSURE_REVIEW.md`      | PHI exposure review                            |
| `docs/OPERATIONS_RECOVERY.md`       | Backup, recovery, RPO/RTO decisions            |
| `docs/ACCESSIBILITY.md`             | Automated and manual accessibility results     |
| `docs/LAUNCH_READINESS.md`          | Sign-off registry and exceptions log           |
| `docs/CLINICAL_RECORDS.md`          | Encounters, amendments, immutability           |
| `docs/DOCUMENTS.md`                 | Uploads, quarantine, review                    |
| `docs/MENTAL_HEALTH_MEASUREMENT.md` | Assessments and risk-flag handling             |
| `docs/TASKS_ALERTS_TIMELINE.md`     | Tasks, alerts, patient timeline                |
| `docs/ADMINISTRATION.md`            | Admin surfaces, feature flags, reporting       |
| `docs/CHANGELOG-CLIENT.md`          | Client-facing release notes                    |
| `docs/superpowers/plans/`           | Implementation plans for post-blueprint work   |

## Data rules

Synthetic data only outside production. No PHI in URLs, logs, filenames, or notification bodies. Clinical records are soft-deleted, never hard-deleted. See `CLAUDE.md` for the full rule set.
