# Environments and Deployment Model

## Purpose

Prevent secrets and data from crossing environments. Every environment has one owner, its own Convex deployment, and its own third-party credentials. Nothing is shared downward from production.

## Environments

| Environment | Purpose                                                | Convex deployment                                        | Data           | Outbound SMS/email                                          |
| ----------- | ------------------------------------------------------ | -------------------------------------------------------- | -------------- | ----------------------------------------------------------- |
| Local       | Developer machines                                     | Per-developer dev deployment (`npx convex dev`)          | Synthetic only | Disabled (no Twilio/Resend keys locally)                    |
| Preview     | Per-PR review builds                                   | Convex preview deployments (branch-scoped, auto-deleted) | Synthetic only | Disabled — preview never receives Twilio/Resend credentials |
| Staging     | Pre-release verification with the full integration set | Dedicated `canyon-creek-staging` project                 | Synthetic only | Enabled, restricted to test numbers and a test mailbox      |
| Production  | Real clinic operations                                 | Dedicated `canyon-creek` production project              | Real PHI       | Enabled                                                     |

## Invariants

- **Separate Convex projects for staging and production.** Not just separate deployments in one project — separate projects, so dashboard access, env vars, and data are isolated.
- **No production data leaves production.** Never export/import production data into any other environment. Debugging uses synthetic reproductions.
- **Synthetic data only outside production.** All non-production patients, contacts, phone numbers, and emails are fabricated. Use reserved test phone numbers (Twilio magic numbers in staging) and a practice-owned test mailbox.
- **Preview cannot send real messages.** `TWILIO_*` and `RESEND_*` are simply not set on preview deployments; the adapters must treat missing credentials as "sending disabled", not as an error to retry.
- **Secrets live only in Convex environment variables** (server) or Vite `VITE_*` publishable values (client). Never in git, never in `.env` committed files. `.env.example` lists names only.

## Setting up the deployments (one-time, requires Convex account access)

```sh
# Production project
npx convex login
npx convex deploy            # from main, targets the production deployment

# Staging: create a second Convex project named canyon-creek-staging in the
# dashboard, then deploy to it from CI or locally:
CONVEX_DEPLOY_KEY=<staging deploy key> npx convex deploy

# Preview deployments (used by CI for PRs):
CONVEX_DEPLOY_KEY=<preview deploy key> npx convex deploy --preview-create <branch>
```

Deploy keys: generate a **production deploy key** and a **preview deploy key** in the Convex dashboard. The preview key can only create preview deployments and cannot touch production. Store both only in the CI secret store.

## Vercel (frontend hosting)

`vercel.json` runs `scripts/vercel-build.sh`. With `CONVEX_DEPLOY_KEY` set it runs `npx convex deploy --cmd 'pnpm build'`, which pushes Convex functions and injects `VITE_CONVEX_URL`. Without a key it runs `pnpm build` against a `VITE_CONVEX_URL` you set in Vercel (use this for a development site pointed at your dev deployment; functions are then whatever `pnpm dev:convex` last pushed). Rewrites send every path to `index.html` for React Router.

Vercel project environment variables:

| Variable                     | Production            | Preview            |
| ---------------------------- | --------------------- | ------------------ |
| `CONVEX_DEPLOY_KEY`          | production deploy key | preview deploy key |
| `VITE_CLERK_PUBLISHABLE_KEY` | live Clerk key        | test Clerk key     |

`VITE_CONVEX_URL` is set by `convex deploy` at build time when a deploy key is present; set it by hand only for the no-key development setup. Server secrets (Clerk secret, Twilio, Resend, `APP_ENV`, `CLERK_JWT_ISSUER_DOMAIN`) live on the Convex deployment, never in Vercel. After the first deploy, point the Clerk production instance's allowed origins and the Twilio/Resend webhook URLs at the Convex HTTP domain, not the Vercel domain.

## Secret ownership and rotation

| Secret                                     | Owner                                     | Where set                                   | Rotation                                                                                                                         |
| ------------------------------------------ | ----------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Convex deploy keys                         | Engineering lead                          | CI secrets                                  | Rotate on team departure or suspected exposure; regenerate in Convex dashboard, update CI, old key stops working immediately     |
| `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET` | Engineering lead                          | Convex env vars (per deployment)            | Rotate via Clerk dashboard per instance (separate Clerk instances for staging/production); update Convex env var in same sitting |
| `VITE_CLERK_PUBLISHABLE_KEY`               | Engineering lead                          | Build-time env (per environment)            | Publishable, low risk; rotate with the instance                                                                                  |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`  | Practice administrator + engineering lead | Convex env vars (staging + production only) | Rotate via Twilio console (secondary token swap: create secondary, promote, delete old)                                          |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`  | Engineering lead                          | Convex env vars (staging + production only) | Create new key, update env var, revoke old key                                                                                   |

Rotation procedure for any secret:

1. Generate the new credential in the vendor dashboard.
2. Update the Convex environment variable (or CI secret) for the affected deployment only.
3. Verify the affected integration in that environment (staging smoke test before production).
4. Revoke the old credential.
5. Record the rotation (date, secret name, reason, operator) in the ops log. Never record the value.

Emergency rotation (suspected compromise): revoke first, then replace — accept the outage.

## Environment identification

- The app shell shows a mode badge in every non-production build (see `src/components/app-shell.tsx`).
- Client builds receive only `VITE_*` variables; server secrets are never bundled (enforced by Vite's env prefix rule).
