# Canyon Creek Ubiquitous Language

Canyon Creek is a clinical practice platform for an integrative mental health, addiction medicine, and ketamine clinic. This glossary defines the terms the code, docs, and conversations must share. Definitions describe what a thing IS; behavior and implementation live in `docs/` and `convex/`.

Derived from `convex/schema.ts`, `convex/lib/permissions.ts`, `convex/lib/access.ts`, and `docs/*.md` on 2026-09-02.

---

## Identity and access

**User**:
One authentication identity (a Clerk account) known to the practice, of type patient or workforce. Soft-deactivated, never deleted.
_Avoid_: account, login, member

**Workforce**:
The set of staff users. A workforce user holds one or more Roles.
_Avoid_: employee, team member, staff account

**Role**:
A named job category assigned to a user: patient, frontDesk, clinicalStaff, provider, administrator, auditor. Roles exist only to derive capabilities.
_Avoid_: permission level, group

**Capability**:
A named permission such as `patient.read`, `encounter.sign`, or `mat.access`. Every server-side authorization decision checks a capability, never a role label.
_Avoid_: permission, right, scope

**Patient Account Link**:
The server-created association between a User and a Patient, with a relationship type (only `self` today; guardian and proxy are reserved). Created exclusively by the invitation flow.
_Avoid_: patient login, linked account

**Ownership**:
The condition that a caller holds an active Patient Account Link to the patient a resource belongs to. Portal access is scoped by ownership; staff access is scoped by capability.

**Invitation**:
A single-use, hashed-token intent to link an identity to the practice: a Workforce Invitation carries roles for a future staff user; a Patient Invitation carries the patient a portal account will link to.

**Feature Flag**:
A server-owned switch that says whether a module exists in an environment. A flag is never a substitute for authorization. Regulated flags (Spravato, HBOT, peptides, billing) require an approval record before production enablement.
_Avoid_: toggle, setting

**Practice Flag**:
One of the five owner-facing flags (`clinical`, `intakeForms`, `communications`, `reporting`, `patientPortal`) that hide whole product areas from navigation and routes.

**Audit Event**:
An append-only record of a sensitive read, write, role change, export, or override, with a typed reason and a derived severity. Never edited or deleted.
_Avoid_: log entry, activity

---

## Patient registry and portal

**Patient**:
The durable clinical identity record for a person receiving care. Archived (soft), never hard-deleted. Distinct from the User that may log in on its behalf.
_Avoid_: client, customer, member, user

**Portal**:
The patient-facing area (`/portal`) where a linked User reads and completes their own record.
_Avoid_: patient app, dashboard

**Chart**:
The staff-facing view of one patient's complete record (`/app/patients/:id`). Alerts render only here.
_Avoid_: profile, patient page

**Registry**:
The staff-facing searchable list of patients.
_Avoid_: patient list, directory

**Readiness**:
A derived, never-stored judgment of whether a patient has completed profile, forms, and consents required before a visit. Computed on read with an explainable item list.
_Avoid_: onboarding status, intake status

**Communication Preference**:
A patient's channel opt-ins (SMS, email, voice) and preferred channel.

---

## Forms, intake, and consent

**Form Template**:
The identity of a configurable form of type intake, consent, or assessment. Content never lives here.
_Avoid_: form, questionnaire

**Form Version**:
An immutable, numbered definition of a Form Template once published. Only drafts are editable. Every response and consent pins the exact version shown.
_Avoid_: revision, edit

**Form Definition**:
The zod-validated data structure (sections, questions, options, conditions, scoring) inside a Form Version. Data, never executable code.

**Form Response**:
A patient's answers to one Form Version. A submitted response is an immutable snapshot with a server-computed score.
_Avoid_: submission, entry, result

**Consent Record**:
An insert-only acceptance of a consent Form Version by a signer, with a typed signature name. Never updated or deleted.
_Avoid_: signature, agreement

**Assignment Rule**:
A configuration stating which Form Template applies to which audience (all, new, returning), optionally scoped by service or appointment type.

**Form Assignment**:
The obligation for one patient to complete one Form Template, either rule-derived or manual. Pending or waived; "completed" is derived at read time from responses and consents.
_Avoid_: task, to-do

**Intake**:
The set of forms and consents a patient completes before care begins. Not a separate record; it is the sum of assignments.

---

## Measurement

**Assessment Definition**:
A controlled clinical instrument (for example a standardized questionnaire) with a stable key and licensing metadata.
_Avoid_: survey, screener, form

**Assessment Version**:
An immutable published pairing of an Assessment Definition with a Form Version plus scoring weights, interpretation ranges, effective dates, and response rules.

**Interpretation**:
A label attached to a score range by the instrument. Guidance only, never a diagnosis.

**Response Rule**:
A condition on a submitted answer that creates a Clinical Review Task and returns practice-approved instructions to the patient. It never changes a diagnosis, medication, or appointment.
_Avoid_: trigger, alert rule

**Clinical Review Task**:
A high-priority, human-review item created by a Response Rule. Open, acknowledged, or resolved with a disposition.
_Avoid_: flag, alert

**Psychiatric Evaluation**:
A structured initial evaluation attached to an Encounter, built from an administrator-approved section configuration. Locked when the encounter is signed.

---

## Scheduling

**Location**:
A physical practice site with an IANA time zone. Multi-location is deferred, but the field is everywhere.

**Provider**:
A bookable clinician. Separate from the User row: not every provider-role user is schedulable.
_Avoid_: doctor, clinician (when meaning the schedulable entity), staff

**Service**:
A catalog line of care (for example MAT, Ketamine) with status active, future, or disabled and an optional effective window. Bookability is decided solely by whether the service is in force.
_Avoid_: program, treatment, offering

**Appointment Type**:
A bookable visit kind under a Service: duration, buffers, location, eligible providers, required resource types.
_Avoid_: visit type, slot type

**Availability Rule**:
A provider's bookable working hours, either recurring by weekday or one-time by date, stored as local minutes from midnight.
_Avoid_: schedule, shift

**Time Off**:
A blocked interval for a provider, stored as canonical instants.
_Avoid_: block, unavailability

**Resource**:
A room or monitoring capacity at a Location that an appointment may reserve.

**Appointment**:
A booked visit for a Patient with a Provider at a Location, with canonical UTC instants and the location time zone at booking. Status: scheduled, confirmed, checkedIn, inProgress, completed, cancelled, noShow.
_Avoid_: booking (as a noun for the record), visit, session

**Appointment Event**:
One append-only row per appointment status transition, with actor and reason.

**Waitlist Entry**:
Captured demand for an Appointment Type within a date window. Conversion to an Appointment is always a deliberate staff action.
_Avoid_: queue, request

**Booking**:
The staff action of creating an Appointment through the normal availability and service checks. Patient self-scheduling is deferred.

---

## Communications

**Message Template**:
The identity of an SMS or email message with an intent. Content lives in immutable Message Template Versions.

**Reminder Schedule**:
A rule that sends a template on a channel a fixed number of minutes before appointments of a given type, for the intent appointmentReminder or incompleteIntake.

**Communication Job**:
One scheduled send to one patient, pinned to a template version and destination, with an idempotency key and a lifecycle (pending through delivered, failed, followUp, resolved, cancelled).
_Avoid_: message, notification, send

**Communication Attempt**:
One provider-level try for a Communication Job, with provider message id and transient or permanent error category.

**Suppression**:
A per-patient, per-channel block on sending.
_Avoid_: unsubscribe, opt-out (the preference is the opt-out; the suppression is the enforcement record)

**Neutral Wording**:
The rule that notification bodies and subjects name no clinical detail ("appointment with the practice"). Applies to every SMS and email.

---

## Clinical chart

**Encounter**:
A clinical visit record tied to an Appointment and a Provider. Draft, signed, or amended.
_Avoid_: visit, note (the note is part of the encounter)

**Encounter Draft**:
The editable working note for an Encounter, with a revision number used to reject stale saves.

**Signed Encounter Note**:
The single immutable snapshot created when a provider signs an Encounter.
_Avoid_: final note, locked note

**Amendment**:
A signed, append-only correction to a Signed Encounter Note. The original is never edited.
_Avoid_: edit, correction (as a verb on the note)

**After-Visit Summary**:
A separate versioned patient-facing summary for an Encounter. Only the latest published, non-withdrawn version is visible in the portal.
_Avoid_: AVS (expand on first use), discharge summary

**Allergy / Medication**:
Longitudinal chart entries with provenance (patient or clinician) and a reconciliation status (pending, confirmed, rejected). Patient-reported entries stay pending until a clinician reconciles them.

**Reconciliation**:
The clinician act of confirming or rejecting a patient-reported allergy or medication.
_Avoid_: approval, review

**Diagnosis**:
A clinician-authored coded condition. Status changes append Diagnosis Events rather than editing history.

**Treatment Plan**:
A patient's plan identity whose content lives in versioned Treatment Plan Versions containing Goals and Actions, each individually marked patient-visible or not.

**Patient-Visible**:
The explicit per-item marking that allows a chart item to appear in the portal. Nothing is portal-visible by default.

---

## MAT (medication-assisted treatment)

**MAT Episode**:
A longitudinal course of substance-use treatment for a patient under a provider. State: active, paused, transferred, completed, archived. Every read requires `mat.access`.
_Avoid_: case, program enrollment

**MAT Assessment**:
Structured MAT intake and history with per-field provenance and clinician verification, reviewed by a provider.

**MAT Medication Plan**:
A clinician-authored medication row for an episode. Superseded, never edited.

**MAT Follow-Up Note**:
Follow-up documentation attached to a standard Encounter, with required sections configured per appointment type.

**Toxicology Record**:
A manually entered specimen result (due, pending, reviewed). Corrections create a superseding record.
_Avoid_: drug test, UDS

**Recovery Plan**:
A versioned statement of goals and supports for an episode.

**Monitoring Event**:
A neutral-labeled operational item in the MAT queue (followUpDue, toxicologyPending, intakeReviewPending, clinicalReview). Carries no clinical detail.

---

## Ketamine

**Ketamine Course**:
The longitudinal clinical approval for a patient's ketamine treatment: screening, active, completed, archived. Eligibility is always a clinician decision.
_Avoid_: program, series, treatment plan

**Clearance Review**:
An append-only clinician decision on a course: approved, deferred, or declined, with rationale. The most recent review governs.

**Protocol Item**:
An administrator-managed rule of kind prerequisite (course precondition), checklist (pre-session), or dischargeCriteria.

**Prerequisite**:
A staff attestation that a Protocol Item of kind prerequisite is satisfied for a course. Not a clinical decision.

**Ketamine Session**:
One treatment visit within a course: planned, ready, inProgress, recovery, completed, cancelled. Documented independently of the course.
_Avoid_: infusion, appointment, treatment

**Session Checklist**:
The per-session verification state for checklist Protocol Items, recording who verified each.

**Session Vitals**:
Append-only vital sign entries in phase baseline, monitoring, or discharge.

**Session Observation**:
An append-only timeline entry of kind observation or medicationAdministration.

**Adverse Event**:
A recorded in-session harm with severity and actions taken.

**Discharge Record**:
The single immutable record that completes a session: criteria met, recovery assessment, escort confirmation, instructions, and any override reason.

**Hard Stop**:
An operational precondition the software enforces (for example an incomplete checklist). Never a clinical eligibility judgment.

---

## Operations

**Task Queue**:
The unit of authorization for work items: holding the queue's required capability grants access to its tasks. Patient-linked tasks additionally require `patient.read`.
_Avoid_: board, inbox, list

**Task**:
An operational work item with priority, due date, optional patient, and optional deep link. Titles are neutral text; a task is never a clinical record.
_Avoid_: ticket, to-do, reminder

**Task Event**:
Append-only history of a task's creation, assignment, priority, and status changes.

**Document**:
The identity and review state of a patient file. Bytes live in immutable Document Versions. Archived, never hard-deleted.
_Avoid_: file, attachment, upload (the upload is the action, the document is the record)

**Document Version**:
One immutable upload with scan status pending, clean, or quarantined. Nothing is downloadable until clean.

**Download Grant**:
A single-use, two-minute, hashed download token whose authorization is re-checked at consumption.
_Avoid_: link, signed URL

**Quarantine**:
The state of a Document Version that failed scanning. Retained for investigation, never served.

**Patient Alert**:
A deliberate, authored chart warning with severity, effective window, visibility (careTeam or allStaff), and reason. Appears only in the chart header; archived, never deleted.
_Avoid_: flag, banner, warning (generic)

**Timeline**:
A chronological index of a patient's appointments, forms, encounters, medication changes, documents, communications, tasks, and summaries. Entries are summaries plus deep links, never copies.
_Avoid_: history, feed, activity log

**Operational Dashboard**:
Counts-only view of a day's appointments, readiness, intake, no-shows, failed messages, tasks, and documents awaiting review.

**Report**:
Aggregate bucket-and-count measures (appointment outcomes, utilization, intake completion, assessment completion, reminder delivery). No patient identifier reaches a row.

**Export**:
A Report leaving the system. Requires `report.export`, a reason, and an audit event; distinct from viewing.

---

## Public content

**Service Page**:
Structured marketing content for a Service on the public site, with a working draft and a published copy. Archive is the only removal path.
_Avoid_: landing page, marketing page

**Blog Post**:
Structured public article with the same draft, published, archived lifecycle as a Service Page.

**Section**:
A typed block of structured content (richText, numberedSteps, itemGrid, calloutPanel, image, bulletList) inside a Service Page or Blog Post.
_Avoid_: block, widget

**Draft Content / Published Content**:
The admin-only working copy and the public copy of a content item. Publishing runs strict validation; drafts autosave without audit events.

---

## Cross-cutting concepts

**PHI (protected health information)**:
Any patient-identifying or clinical detail. Never in URLs, logs, analytics, filenames, or notification bodies.

**Immutable Record**:
A row that is never edited after a terminal state: signed notes, consents, published versions, audit events, lifecycle events. Change is expressed by amendment, supersession, or a new version.

**Supersede**:
To replace a record by creating a successor that points at the original, leaving the original intact.
_Avoid_: overwrite, update, replace (when it would imply mutation)

**Archive**:
The only removal path for clinical and content records. Soft, reasoned, audited.
_Avoid_: delete, remove

**Provenance**:
Whether a chart datum was patient-reported or clinician-entered, and whether a clinician has verified it.

**Canonical Instant**:
A UTC epoch millisecond timestamp. All stored moments are canonical instants; wall-clock configuration is local minutes plus an IANA zone.

**Idempotency Key**:
A deterministic key that makes webhooks, reminders, and scheduled jobs replay-safe.

**Reason**:
Required operational text attached to overrides, cancellations, archives, blocks, exports, and flag changes. Never PHI.

**Human Review**:
The principle that software never makes clinical decisions. Risk signals create review items for people; diagnosis, medication, and eligibility remain clinician judgments.

**Deferred Feature**:
Functionality intentionally not built yet: patient self-scheduling, secure messaging, billing, e-prescribing, Spravato, HBOT, peptides, multi-location. Schema fields may exist; behavior does not.

**Synthetic Data**:
Fabricated records used everywhere except production.
