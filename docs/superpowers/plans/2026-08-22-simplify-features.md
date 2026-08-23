# Plan: Simplify to four owner-facing features

Goal: the owner sees only Booking, Staff/Users, Services, and Blog. Everything
else is switched off by a server-owned feature flag and hidden from navigation
and routes. The Feature flags page becomes a plain-language "Features" page.

## Current state

- Flags live in `convex/lib/featureFlags.ts` (`FEATURE_FLAGS`, env defaults)
  and `convex/domains/featureFlags.ts` (`isFeatureEnabled`, `requireFeature`,
  `listFlags` (auth required), `setFlag` (`config.manage`, reason, audit)).
- Existing flags: `spravato`, `hbot`, `peptides`, `billing` (regulated),
  `secureMessaging`, `integrations`. None gate a page that currently exists.
- No client-side flag hook exists. The only client consumer is
  `src/features/administration/feature-flags-page.tsx` (a developer-oriented
  table: environment, default, override, approval, `window.prompt` reason).
- Navigation surfaces: `admin-page.tsx` (10 hub cards), `workforce-page.tsx`
  (5 hub cards), `marketing-chrome.tsx` (Staff/Admin menu, Patient Portal
  link), `portal-page.tsx` (portal nav), `routes.tsx`.
- Booking (`/app/schedule`, `/app/waitlist`, `/app/appointments/:id`,
  `/app/patients/:id/book`) links to and depends on patient rows
  (`/app/patients`, `/app/patients/new`, `/app/patients/:id`).

## Feature mapping

| Keep ON (no flag) | Routes                                                                                                                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Booking           | `/app`, `/app/schedule`, `/app/waitlist`, `/app/appointments/:id`, `/app/patients`, `/app/patients/new`, `/app/patients/:id`, `/app/patients/:id/book`, `/admin/scheduling`, `/admin/scheduling/providers`, public `/book` |
| Staff / users     | `/admin`, `/admin/users`, `/admin/users/:id`                                                                                                                                                                               |
| Services          | `/admin/services`, `/admin/service-pages`, `/admin/service-pages/:id/preview`, public `/services*`                                                                                                                         |
| Blog              | `/admin/blog`, `/admin/blog/:id/preview`, public `/blog*`                                                                                                                                                                  |
| Features page     | `/admin/feature-flags`                                                                                                                                                                                                     |

| New flag key     | Owner label                  | Gates                                                                                                                                                              |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `clinical`       | Clinical charting            | `/app/encounters/:id`, `/app/ketamine*`, `/app/mat-queue`, `/app/tasks`, `/app/clinical-review`, `/app/documents/review`; workforce card "Clinical reconciliation" |
| `intakeForms`    | Intake and consent forms     | `/admin/forms*`; admin card "Form templates"                                                                                                                       |
| `communications` | Communication settings       | `/admin/communications`, `/app/communications/failures`; both cards                                                                                                |
| `reporting`      | Dashboard, reports and audit | `/admin/dashboard`, `/admin/reports`, `/admin/audit`; three cards                                                                                                  |
| `patientPortal`  | Patient portal               | `/portal*`; "Patient Portal" nav and footer links                                                                                                                  |

Defaults: `development: true`, `preview/staging/production: false`. An
admin override (stored row) flips any of them on.

Existing regulated flags stay as-is but move into a collapsed "Advanced"
section on the page so the owner never sees them by default.

## Steps

### 1. Define the flags (`convex/lib/featureFlags.ts`)

- Add the five entries above to `FEATURE_FLAGS` with `regulated: false`.
- Add an optional `description: string` to `FlagDefinition` for the
  owner-facing one-liner shown on the Features page (e.g. "Charts, notes,
  ketamine and MAT queues for clinical staff"). Existing flags omit it.
- Add a shared `PRACTICE_DEFAULTS` constant (`development: true`, rest
  false) next to `OFF`.

### 2. Public flag read (`convex/domains/featureFlags.ts`)

- Add `query publicFlags` (no auth) returning `Record<string, boolean>` of
  effective values for every key. Flag state is presentation-only config,
  not PHI, and the unauthenticated marketing nav needs it for the Patient
  Portal link. `listFlags` is unchanged.

### 3. Client gate (`src/lib/features.tsx`, new)

- `useFeatureEnabled(key): boolean | undefined` wrapping
  `useQuery(api.domains.featureFlags.publicFlags)`. When auth/Convex is not
  configured (`useAuthConfigured()` false) return `false` so keyless builds
  and unit tests hide gated surfaces instead of crashing.
- `<FeatureGate flag>`: renders children only when enabled (nav items, cards).
- `<RequireFeature flag>`: loading shows the existing `RouteLoading` text;
  disabled renders the existing `NotFound` from `components/app-shell.tsx`.
  Used around route elements, outside `RequireAuth` so an off feature reads
  as "page does not exist" rather than "no access".

### 4. Hide gated surfaces

- `src/routes.tsx`: wrap each gated route element per the mapping table in
  `<RequireFeature flag="...">`. Portal: wrap the `portal` parent element.
- `src/features/workforce/workforce-page.tsx`: `FeatureGate` around
  "Clinical reconciliation" (`clinical`) and "Failed communications"
  (`communications`).
- `src/features/administration/admin-page.tsx`: `FeatureGate` around
  Communications, Form templates, Operations dashboard, Reports, Audit
  review. Rename "Feature flags" card to "Features" with description
  "Turn parts of the site on or off."
- `src/features/public/marketing-chrome.tsx`: wrap the Patient Portal link
  in `AccountLinks` / `SignedInAccountLinks` and the footer portal link in
  `FeatureGate flag="patientPortal"`. The unconfigured branch (no auth)
  keeps its current behaviour.
- Booking pages keep their patient links; patients remain on.

### 5. Owner-friendly Features page (`feature-flags-page.tsx`)

- Heading "Features", intro "Turn parts of the site on or off. Changes
  apply immediately for everyone."
- Two lists, split by `regulated`:
  - Practice features: label, description, state, one button
    "Turn on"/"Turn off". Drop the Environment, Default, Override and
    Approval columns.
  - Regulated modules: inside a native `<details>` titled "Advanced
    (regulated modules)", keeping the current table and approval flow.
- Keep the reason prompt (audit requirement) but reword:
  "Why are you turning X off? (kept in the activity log)".
- Remove the environment line from the intro; show it only inside Advanced.

### 6. Docs

- `docs/ADMINISTRATION.md` "Feature flags" section: list the five new flags,
  what each hides, the default policy, and that gating is presentational
  (capabilities still enforce access).

## Files likely to change

| File                                                 | Change                                       |
| ---------------------------------------------------- | -------------------------------------------- |
| `convex/lib/featureFlags.ts`                         | 5 flags, `description`, defaults             |
| `convex/domains/featureFlags.ts`                     | `publicFlags` query                          |
| `src/lib/features.tsx`                               | new: hook + `FeatureGate` + `RequireFeature` |
| `src/routes.tsx`                                     | wrap ~14 routes                              |
| `src/features/workforce/workforce-page.tsx`          | 2 gated cards                                |
| `src/features/administration/admin-page.tsx`         | 5 gated cards, rename card                   |
| `src/features/public/marketing-chrome.tsx`           | gate portal links                            |
| `src/features/administration/feature-flags-page.tsx` | owner-friendly layout                        |
| `docs/ADMINISTRATION.md`                             | flag docs                                    |

Unchanged: Convex domain functions, schema, scheduled jobs, tests.

## Assumptions

1. Patient registry, create and chart stay visible: booking an appointment
   requires a patient row and every booking page links to the chart. Hiding
   clinical sections inside the chart page is not in this plan.
2. "Booking management" includes scheduling configuration and provider
   availability (`/admin/scheduling*`) and the waitlist.
3. "Services management" includes both the bookable catalog and website
   service pages.
4. Gating is presentation-only. Convex functions keep their capability
   checks; they are not additionally wrapped in `requireFeature`. A
   deep-linked user with the capability gets a 404 page but could still call
   the API. This matches the CLAUDE.md rule that a flag is never a substitute
   for authorization and keeps the diff small.
5. `publicFlags` exposes on/off state without auth. Acceptable: the values
   are product configuration, not PHI or secrets.
6. Development defaults to ON so local work and existing test expectations
   are undisturbed; deployed environments default to OFF.
7. The reason prompt stays (audit event requires a typed reason).

## Risks

- `patientPortal` off: patients who sign up land on `/portal` and see
  "Page not found". Mitigation: `RequireFeature` fallback for the portal
  route shows "The patient portal is not available. Call the practice."
  instead of the generic 404 (small special case in step 4).
- `communications` off hides the admin and failure-queue UI only; reminder
  jobs still run (governed by the existing `integrations` flag). Say so in
  the flag description.
- Unit tests that render `admin-page`, `workforce-page` or routes may need
  a mocked `publicFlags` response; excluded from this plan per instruction
  but will surface when `npm test` runs.
- Flag values are read via one reactive query per page; negligible cost.

## Acceptance criteria

- With no overrides in a deployed environment, the admin hub shows only:
  Workforce users, Bookable services, Website services, Features,
  Scheduling configuration. Workforce hub shows only Patient registry,
  Schedule, Waitlist.
- The marketing nav shows no Patient Portal link; `/portal` shows the
  not-available notice.
- Direct navigation to any gated route renders Page not found.
- Turning a feature on from the Features page restores its cards, links
  and routes without a reload; an audit event with reason is written.
- Regulated modules are hidden under Advanced and keep their approval
  requirement.
- Booking, staff, services and blog flows are unchanged.
- `npm run typecheck` and `npm run lint` pass.

## Verification plan

1. `npx convex dev` with `APP_ENV` unset: everything visible (dev default).
2. Set `APP_ENV=staging` locally: confirm the acceptance list above by
   visiting `/app`, `/admin`, `/`, `/portal`, and each gated URL.
3. As `config.manage`, toggle `reporting` on: `/admin/dashboard` loads and
   the card appears; check `/admin/audit` (now visible) for the
   `feature_flag.enabled` event.
4. Toggle `patientPortal` on, sign in as a patient: portal works as before.
5. Open Advanced, attempt to enable `billing` in staging: no approval
   required; in production it must still demand an approval record.
6. Lint and typecheck.
