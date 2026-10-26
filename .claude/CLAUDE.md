# CLAUDE.md

Public website and content administration for an integrative mental health / addiction medicine / ketamine clinic. See `CANYON_CREEK_SPEC.md` (requirements), `CANYON_CREEK_BLUEPRINT.md` (build order), and `README.md` (setup, scripts, layout, status).

## Stack

React 19 + TypeScript (strict), Vite, React Router, Tailwind CSS 4, shadcn/ui, Convex, Clerk (auth), Zod. pnpm only. Lint is oxlint, tests are Vitest + RTL + convex-test, e2e is Playwright.

## Build order

On 2026-10-26 the application was reduced to the public website plus content administration. All clinical, scheduling, portal, booking, intake, communications, workforce, reporting, and feature-flag modules were removed from the tree; their history remains in git.

## Commands

`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm e2e`. The pre-commit hook runs the first four; CI runs all plus build. Run them before claiming a task done.

## Structure

- `src/routes.tsx` — route tree; groups are `/` (public) and `/admin`, plus Clerk sign-in/sign-up
- `src/features/` — `public`, `auth`, `administration` (service-page and blog editors)
- `src/components/` — app and admin shells, `ui/` editor primitives; `src/lib/` — auth and utilities
- `convex/` — schema.ts, domains/ (`blog`, `content`, `contentSeed`, `users`, `audit`), lib/ (access, audit, content, contentImages, logger, permissions), http.ts (Clerk webhook), health.ts
- `tests/` — unit/ (Vitest, RTL, convex-test), e2e/ (Playwright + axe), fixtures/ (synthetic user builder)
- Client-side changes that users see get a note in `docs/CHANGELOG-CLIENT.md`.

## Non-negotiable rules

- **Authorization is server-side in Convex.** UI permission gates are presentation only. Protected functions check capabilities; retain deny-path tests.
- **No PHI** in URLs, logs, analytics, or filenames.
- **Immutable records:** audit events and immutable published versions are never edited; corrections require a new version. Website content uses a working draft and a published copy.
- **Idempotency** for Clerk webhooks: deterministic identities, replay-safe updates, verified signatures.
- **Audit events** for sensitive reads/writes, role changes, and content lifecycle changes, with a reason where required.
- **Soft-delete/archive** content and users; never hard delete.
- Secrets only in env config, never client bundles.
- Feature flags were removed with the modules they gated; reintroduce the server-owned mechanism before adding any gated module.
- Synthetic data only outside production.

## Definition of done (every task)

Acceptance criteria met; strict TS, lint, and tests pass; loading/empty/error/success states implemented; server-side authz + denial tests; audit events added where required; no PHI leakage; docs and env examples updated.

## Deferred (do not build yet)

Patient portal, clinical charting, scheduling, booking, intake forms, communications, workforce management, reporting, patient self-scheduling, secure messaging, billing/payments, e-prescribing, Spravato, HBOT, peptides, multi-location.
