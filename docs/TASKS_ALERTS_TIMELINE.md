# Tasks, alerts, and the patient timeline

Increment 11 makes cross-cutting clinical operations assignable, trackable,
and visible to exactly the right users. Document handling is documented
separately in `DOCUMENTS.md`.

## Tasks and work queues (11.1)

- `taskQueues` — a queue is the unit of authorization. Its
  `requiredCapability` is validated against `lib/permissions` on every write,
  so a typo cannot create a queue nobody (or everybody) can reach.
- `tasks` — operational work items with priority, due date, optional patient,
  and an optional `entityType`/`entityId` deep link.
- `taskEvents` — append-only creation, assignment, priority, and status
  history.

**Invariants**

- Access is two-sided: the caller must hold the queue's capability, and a
  patient-linked task additionally requires `patient.read`. Every list
  re-derives this per task, so one query can never leak work from an
  inaccessible queue.
- Assignment is refused when the assignee could not access the queue.
- Transitions: `open → inProgress | blocked | completed | cancelled`,
  `inProgress → blocked | completed | cancelled`,
  `blocked → open | inProgress | cancelled`. Completed and cancelled are
  terminal. Blocking or cancelling requires a reason.
- Task titles are neutral operational text. A task is never a substitute for
  a clinical record.

## Clinical alerts (11.4)

- `patientAlerts` — type, severity, message, effective window, visibility
  scope, author, and reason. `patientAlertAcknowledgements` records one
  acknowledgement per user.
- `careTeam` alerts require `clinical.manage`; `allStaff` alerts are readable
  with `patient.read` so operational warnings reach the front desk without
  widening clinical access. Patients never read alerts.
- Alerts render in the chart header only. No query here feeds patient search,
  work queues, or notifications.
- Alerts are archived, never deleted. Expired alerts leave the header and
  remain in `listHistory`. Creation, change, acknowledgement, and archive are
  audited, each with a required reason.

## Unified timeline (11.5)

`timeline.listForPatient` (staff) and `timeline.myTimeline` (portal) build one
chronological index from appointments, submitted forms, encounters,
medication changes, documents, communications, tasks, and published
after-visit summaries.

**Invariants**

- Entries are summaries plus deep links. The timeline never duplicates the
  underlying record — a medication entry says the list changed, it does not
  restate the medication; a communication entry carries channel, intent, and
  delivery state, never the message body.
- Event types are gated by capability before collection, so a denied type is
  absent from the response rather than filtered client-side:

  | Type                              | Staff capability       |
  | --------------------------------- | ---------------------- |
  | appointment, form, document, task | `patient.read`         |
  | encounter, afterVisitSummary      | `encounter.read`       |
  | medication                        | `clinical.manage`      |
  | communication                     | `communication.manage` |

- Tasks are further filtered to queues the viewer can access.
- The portal timeline is limited to appointments, forms, patient-visible
  documents, and published after-visit summaries, and its links stay inside
  `/portal`.
- Pagination is a `before` timestamp cursor plus `limit` (default 50, max
  200); `nextBefore` is null on the last page.
