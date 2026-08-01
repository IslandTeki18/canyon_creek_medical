# Launch Readiness Reviews (Blueprint 13.7)

Production launch requires written approval — or a documented block — from
every owner below. This file is the traceable record: update the status
column with the decision date and a link to the signed review. Software
delivery evidence lives in the referenced docs and test suites; the reviews
themselves are performed by qualified people, not by this codebase.

## Sign-off registry

| Review                                             | Owner (named before pilot)        | Evidence to review                                                                                                                                                                   | Status  |
| -------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| Clinical workflow review                           | Designated clinical owner         | Staging walkthrough of intake → booking → encounter → MAT/ketamine flows with synthetic data; confirmation the software encodes no autonomous clinical decisions                     | Pending |
| Privacy & security review                          | Privacy/security officer          | `docs/DATA_EXPOSURE_REVIEW.md`, authorization matrix (`tests/unit/authorization-matrix.test.ts`), webhook hardening tests, `docs/SESSION_SECURITY.md`, audit review interface (12.5) | Pending |
| Vendor agreements & production configuration       | Practice administrator + counsel  | Executed healthcare contractual terms (incl. BAAs) for Clerk, Convex, Twilio, Resend; production domains, sender identities, callback endpoints per `docs/ENVIRONMENTS.md`           | Pending |
| State-specific & substance-use-record requirements | Qualified counsel                 | MAT data handling (42 CFR Part 2 applicability), consent language, state telehealth/practice rules                                                                                   | Pending |
| Operations & recovery                              | Practice leadership               | `docs/OPERATIONS_RECOVERY.md` decisions: RPO/RTO, notification owner, retention policy; completed tabletop and staging recovery exercises                                            | Pending |
| Accessibility                                      | Engineering + designated reviewer | `docs/ACCESSIBILITY.md` automated results and completed keyboard walkthroughs                                                                                                        | Pending |

## Exceptions log

Approved exceptions must be recorded here — never accepted verbally.

| #   | Exception                                                                       | Risk accepted                                                                  | Owner       | Due date                     | Launch blocker? |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------- | ---------------------------- | --------------- |
| 1   | Malware scanning vendor not yet wired; uploads stay in quarantine until scanned | Documents unavailable for download until a scanner is integrated (fail-closed) | Engineering | Before pilot patient uploads | Yes             |

## Rules

- A row moves from Pending only with a dated, attributable decision.
- A "No" or expired exception is a launch blocker; Increment 14 (pilot)
  does not start until every blocker row is resolved or formally accepted.
- Re-run this review after any change that alters authorization, data
  handling, integrations, or clinical workflow scope.
