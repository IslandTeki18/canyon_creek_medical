# Administration and reporting

Increment 12. Administrators configure services, control unapproved
modules, monitor daily operations, export aggregate measures, and review
sensitive activity — all without direct database access.

## Service catalog (12.1)

- `services` carry `active | future | disabled` plus an optional effective
  window. `lib/administration.serviceInForce` is the single bookability
  test, enforced in `createBooking`: a `future` or expired service is fully
  configurable but never bookable.
- `administration.getServiceConfiguration` resolves the dependency graph for
  one service: appointment types with their reminder schedules, form
  assignment rules, required resource types with available capacity at the
  type's location, and permitted providers.
- **Migration choice.** Disabling a service, or archiving an appointment
  type, is refused while future appointments in an active status depend on
  it. The administrator picks:
  - `keepExisting` — configuration stops accepting new bookings; existing
    appointments stand and are rescheduled by hand.
  - `cancelAffected` — appointments are cancelled with an event row, an
    audit event, and reminder invalidation, exactly as a manual cancellation
    behaves.
- Every configuration change is audited with a reason.

## Feature flags (12.2)

- Definitions and per-environment defaults live in `lib/featureFlags`; a
  `featureFlags` row is an explicit override written only by `config.manage`.
  No client value can enable a disabled backend feature.
- Flags: `spravato`, `hbot`, `peptides`, `billing` (regulated),
  `secureMessaging`, and `integrations`.
- **Regulated modules** cannot be enabled in production without an approval
  record (reference, approver, timestamp) — the artifact the deployment
  checklist points at.
- `requireFeature` composes with `requireCapability`; it never replaces it.
  A flag says whether a module exists, authorization says who may use it.
- `integrations` gates `claimDueJob`, so preview deployments send nothing and
  a production pause leaves jobs pending rather than discarded.
- `APP_ENV` (`development | preview | staging | production`) selects the
  defaults. Unset means development.

## Public service pages

- `/admin/service-pages` lets administrators author, order, publish,
  unpublish, and archive structured website service content. All writes
  require `config.manage`; archive is the only removal path, and every state
  change writes a `content.servicePage.*` audit event.
- Run `npx convex run domains/contentSeed:seedServicePages` once per
  environment to migrate the original six marketing pages. The seed requires
  an active administrator and safely skips existing slugs on repeat runs.
- `content.listPublishedServicePages` and
  `content.getPublishedServicePage` are intentionally unauthenticated public
  queries. They return published rows only through an explicit field
  allowlist and are documented exemptions in the authorization matrix.
- Spravato, HBOT, and peptide content remains a hardcoded future-services
  preview; these flag-gated modules cannot be published through this editor.

## Operational dashboard (12.3)

- `reporting.operationalDashboard` returns counts only: appointments,
  unconfirmed, not-ready patients, incomplete intake, no-shows, completed,
  failed messages, unresolved tasks, and documents awaiting review, each with
  the queue that explains it.
- Filters: date, location, provider. Readiness is computed only for the day's
  scheduled patients, so cost is bounded by the schedule, not the registry.
- The day window is read wide and filtered by local date, so a DST transition
  cannot drop or duplicate a day.
- Convex queries are reactive, so counts update as records change; there is
  no staleness window to display.

## Reports and exports (12.4)

| Report                 | Bucket           | Columns                                        |
| ---------------------- | ---------------- | ---------------------------------------------- |
| `appointmentOutcomes`  | local date       | scheduled, completed, cancelled, noShow, total |
| `serviceUtilization`   | appointment type | booked, completed, noShow                      |
| `intakeCompletion`     | form template    | assigned, completed, waived                    |
| `assessmentCompletion` | instrument       | assigned, completed                            |
| `reminderDelivery`     | intent + channel | sent, delivered, failed, cancelled, total      |

- Rows are buckets and counts. No patient identifier reaches a row, so an
  export is a process measure, not a chart extract. Nothing claims clinical
  causation.
- `report.view` reads; `report.export` is a separate capability because the
  data leaves the system. Export requires a reason and writes an audit event
  recording actor, report, date scope, service filter, and row count.
- Limits: 366-day range, 5000 rows (`truncated` flags a cut). Export
  filenames carry only the report key and range.

## Audit review (12.5)

- `auditEvents` are append-only: no mutation anywhere patches or deletes a
  row, and the audit module exposes only queries plus an internal-only
  `recordSecurityEvent`.
- Each event carries actor, action, entity type/id, timestamp, reason,
  correlation id, and severity. Severity is derived from the action family in
  `lib/audit.severityForAction`, so classification cannot drift between call
  sites.
- **High priority**: exports, role changes, administrator bootstrap, clinical
  hard-stop overrides, break-glass access, and `security.*` trust-boundary
  failures. Webhook signature verification failures (Clerk, Twilio, Resend)
  write one, so an auditor finds them without reading server logs.
- Filters: actor, entity, action prefix, severity, and time window.
  `audit.view` is required; the trail carries operational metadata only, so
  reviewing a sequence never grants access to the records it describes.
