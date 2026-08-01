# Backup, Recovery, and Incident Procedures (Blueprint 13.5)

Companion to `docs/ENVIRONMENTS.md` (secrets, rotation) and
`docs/OBSERVABILITY.md` (logging, severity). Items marked **[practice
decision]** require sign-off from practice leadership before pilot and are
tracked in `docs/LAUNCH_READINESS.md`.

## Backup and restore

- **Mechanism:** Convex cloud backups (dashboard → Settings → Backup &
  Restore). Enable scheduled daily backups on the production deployment and
  retain per the approved retention policy **[practice decision]**.
- **Manual export:** `npx convex export --path <file.zip> --prod` produces a
  full snapshot (tables + file storage). Run before every schema migration
  that rewrites data and before cutover events. Store exports only in the
  practice-controlled encrypted location named in the vendor agreement —
  never on personal machines.
- **Restore:** `npx convex import --replace-all` into the target deployment,
  or dashboard restore from a cloud backup. Restore is destructive to the
  target; restore to **staging first**, verify, then schedule the production
  restore inside a declared downtime window.
- Environment variables are not part of the snapshot; they are restored from
  the secret inventory in `docs/ENVIRONMENTS.md`.

## Recovery objectives

- **RPO (max data loss):** 24h with daily backups; effectively lower because
  Convex is the single system of record and incidents rarely require full
  restore. Tighten by raising backup frequency if leadership requires
  **[practice decision]**.
- **RTO (max downtime):** target 4 business hours for full restore
  **[practice decision]**.

## Staging recovery exercise

Run once before pilot and after any major schema change, using synthetic
data only:

1. Export staging (`convex export`).
2. Destroy a table's contents deliberately (synthetic data).
3. Restore the export; run the smoke suite (`pnpm e2e`) and spot-check a
   patient chart, an appointment, and a signed encounter.
4. Record duration and gaps in the ops log. The measured duration is the
   evidence for the RTO commitment.

## Incident triage

Severity is judged by patient safety, privacy, data integrity, operational
blockage, inconvenience — in that order (blueprint §21).

| Step     | Action                                                                                                                                                                                                                                                                        | Owner            |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Detect   | Critical log events, failed-communication queue, audit high-priority views, user reports                                                                                                                                                                                      | On-call engineer |
| Declare  | Open an incident record (time, symptom, suspected scope); name an incident lead                                                                                                                                                                                               | Incident lead    |
| Contain  | Credential compromise → rotate per `docs/ENVIRONMENTS.md` emergency rotation (revoke first). Account compromise → suspend the user (Convex denies stale sessions immediately, see `docs/SESSION_SECURITY.md`). Messaging fault → disable the reminder cron before more sends. | Incident lead    |
| Preserve | Do not delete or edit audit events, webhook receipts, or logs; export relevant audit slices before any remediation that touches data                                                                                                                                          | Incident lead    |
| Notify   | Privacy officer decides whether the event is reportable and owns patient/regulator notification **[practice decision — named owner required]**                                                                                                                                | Privacy officer  |
| Review   | Post-incident write-up: timeline, root cause, corrective actions, doc updates                                                                                                                                                                                                 | Incident lead    |

## Downtime workflow

While the application is unavailable:

- Front desk falls back to the **printed daily schedule** (print the day's
  appointment list at opening each day) and a paper intake packet kept at
  the desk.
- Appointment changes and patient communications are recorded on paper and
  entered into the system after recovery; reminder jobs are idempotent, so
  re-entry does not double-send.
- Clinical documentation during downtime uses the practice's approved paper
  forms and is entered as encounters afterward with the actual service time.

## Tabletop exercise

Before pilot, walk the four scenarios with the named owners and record the
outcome: (1) data corruption requiring restore, (2) credential compromise,
(3) messaging misfire (wrong/duplicate sends), (4) full availability loss
during clinic hours. The exercise passes when every step above has a named
person and no step required improvisation.
