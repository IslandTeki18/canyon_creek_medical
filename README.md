# Canyon Creek

Public website and content administration for an integrative mental health, addiction medicine, and ketamine clinic.

Requirements live in `CANYON_CREEK_SPEC.md`; build order in `CANYON_CREEK_BLUEPRINT.md`. Agent and contributor rules are in `.claude/CLAUDE.md`.

## Stack

| Layer      | Choice                                                        |
| ---------- | ------------------------------------------------------------- |
| Frontend   | React 19, TypeScript (strict), Vite, React Router             |
| UI         | Tailwind CSS 4, shadcn/ui (radix-nova), lucide                |
| Backend    | Convex (schema, queries, mutations)                           |
| Auth       | Clerk (webhooks via svix)                                     |
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

Set Clerk secrets and the JWT issuer domain as Convex deployment environment variables, not in the client bundle. See `docs/ENVIRONMENTS.md` for environment separation.

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
src/
  main.tsx, index.css
  routes.tsx                 public + auth + /admin only
  components/
    app-shell.tsx, route-status.tsx
    staff-shell.tsx          AdminShell, content and inbox navigation
    ui/                      shared primitives used by content editors
  lib/
    auth.tsx                 RequireAuth, AuthControls, AppProviders
    utils.ts
  features/
    public/                  marketing pages including contact-page.tsx
    auth/                    unchanged
    administration/
      inquiries-page.tsx
      blog-posts-page.tsx, blog-post-preview-page.tsx
      service-pages-page.tsx, service-page-preview-page.tsx
      preview-payload.ts, use-autosave.ts, upload-content-image.ts
convex/
  schema.ts                  users, auditEvents, servicePages, blogPosts, contactInquiries
  auth.config.ts, health.ts
  http.ts                    /clerk-webhook only
  domains/                   audit.ts (recordSecurityEvent only), blog.ts,
                             contact.ts, content.ts, contentSeed.ts, users.ts
  integrations/              turnstile.ts
  lib/                       access.ts, audit.ts, content.ts,
                             contentImages.ts, logger.ts, permissions.ts
tests/
  unit/                      only tests for kept code
  e2e/                       smoke + accessibility, no /book
  fixtures/forms.ts          seedUser only
```

## Route groups

| Prefix   | Audience       | Auth                                      |
| -------- | -------------- | ----------------------------------------- |
| `/`      | Public site    | None                                      |
| `/admin` | Administrators | Active Clerk user with admin capabilities |

`/sign-in` and `/sign-up` are Clerk authentication pages. `/admin` redirects to `/admin/service-pages`.

Authorization is enforced in Convex on every public function. Client-side gates only hide UI.

## Status

On 2026-10-26 the application was reduced to the public website plus content administration. All clinical, scheduling, portal, booking, intake, communications, workforce, reporting, and feature-flag modules were removed from the tree; their history remains in git.

The public `/contact` form stores Contact Inquiries for staff follow-up in `/admin/inquiries`. It uses Turnstile and a honeypot, sends no email or text, and retains archived inquiries. Contact details remain placeholders. Configure the Turnstile keys and `APP_ENV` as described in `docs/ENVIRONMENTS.md`.

## Documentation

| Doc                            | Content                                        |
| ------------------------------ | ---------------------------------------------- |
| `docs/ENVIRONMENTS.md`         | Local, preview, staging, production separation |
| `docs/OBSERVABILITY.md`        | Logging and health checks (no PHI in logs)     |
| `docs/SESSION_SECURITY.md`     | Session and idle controls                      |
| `docs/DATA_EXPOSURE_REVIEW.md` | PHI exposure review                            |
| `docs/OPERATIONS_RECOVERY.md`  | Backup, recovery, RPO/RTO decisions            |
| `docs/ACCESSIBILITY.md`        | Automated and manual accessibility results     |
| `docs/LAUNCH_READINESS.md`     | Sign-off registry and exceptions log           |
| `docs/ADMINISTRATION.md`       | Service-page, blog, and inquiry administration |
| `docs/CHANGELOG-CLIENT.md`     | Client-facing release notes                    |
| `docs/superpowers/plans/`      | Implementation plans for post-blueprint work   |

## Data rules

Synthetic data only outside production. No PHI in URLs, logs, filenames, or notification bodies. Content is archived with a reason and an audit event. See `.claude/CLAUDE.md` for the full rule set.
