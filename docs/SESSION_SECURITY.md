# Session Security Controls

Purpose: workforce authentication controls for healthcare operations
(Blueprint 1.5). Clerk owns authentication policy; Convex independently
denies inactive accounts, so a stale browser session is never sufficient.

## MFA policy (Clerk dashboard)

- Staging and production Clerk instances: **User & Authentication →
  Multi-factor** — enable TOTP (authenticator app) and backup codes; SMS
  optional per practice policy.
- Set MFA to **required** for workforce users. Patients: per practice
  policy (recommended optional).
- Owner: administrator listed in `docs/ENVIRONMENTS.md`. Verify the setting
  in both instances after any Clerk plan or instance change.

## Session duration and inactivity

Configure in Clerk **Sessions** settings per environment:

- Maximum session lifetime: 12 hours (workforce shift length).
- Inactivity timeout: 30 minutes.
- Multi-session handling: single session per tab-group default.

These are policy defaults; the practice's compliance owner approves final
values before production.

## Session and device review

Users review active devices/sessions through Clerk's account UI: the
header avatar (UserButton) → **Manage account → Security → Devices**. Each
device can be signed out individually. No custom device UI is built; Clerk
is the source of truth.

## Server-side enforcement invariant

Every Convex function resolves the caller through
`requireAuthenticatedUser` (`convex/lib/access.ts`), which loads the user
row and rejects any status other than `active`. Suspension or deactivation
therefore takes effect on the next server call even if:

- a Clerk client session token is still cached in the browser, or
- the user keeps a tab open past a role or status change.

Covered by tests: `tests/unit/authorization.test.ts` ("suspended/
deactivated users are denied even with a live session") and
`tests/unit/workforce-admin.test.ts` (suspension takes effect immediately).

## Emergency session revocation — test procedure

1. In staging, sign in as a synthetic workforce user in browser A.
2. As an administrator in browser B, open the user in `/admin/users` and
   mark them **suspended** with a reason.
3. In browser A (without refreshing), trigger any server call (e.g. open
   the workforce user list). Expected: the call fails with
   "Account is not active" and no data renders.
4. In the Clerk dashboard, revoke the user's sessions (**Users → user →
   Sessions → Revoke**). Expected: browser A is signed out on next
   navigation.
5. If Clerk credentials are suspected compromised, rotate the instance
   secret key per `docs/ENVIRONMENTS.md` rotation procedure and revoke all
   sessions for affected users.

Record each drill (date, operator, result) in the practice's operations
log.
