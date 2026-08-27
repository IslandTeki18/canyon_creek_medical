# What's New — Canyon Creek Platform

## August 2026 Update — New look

### Public website

- The site has a new visual direction: a light blue ground, one blue accent
  for every action, and a single typeface (Plus Jakarta Sans). Cards float on
  soft shadow instead of borders.
- The home page opens with a hero panel, a numbered service list with
  Ketamine Therapy highlighted, a "coming soon" strip, and a closing call to
  action. Service pages carry a labeled cover slot, check-marked condition
  tiles, step cards, and a teal safety note.
- The journal index and articles use the same system: filter pills, a
  featured card, a sticky table of contents, and a crisis-line note on every
  article.
- The home page hero and "whole person" section now show real photos
  instead of labeled placeholders.

### For Staff and Administrators

- Blog posts are now two screens: a list with search and Live / Drafts /
  Archived filters, and a full-width editor with a grouped top bar (back,
  title and status, save state, actions). Post cards show the category, the
  public address, and the last-updated date. Cover images upload from a
  drop zone, and publish problems appear as a checklist in the rail.

- The staff and admin hubs are replaced by a persistent sidebar plus a real
  work surface. Staff land on Today: counts, the day's schedule with
  readiness, tasks assigned to you, and patient lookup. Administration is
  four grouped lists with today's counts and feature switches alongside.
- Blog authoring moved from Administration to the staff workspace (/app/blog)
  and appears in the sidebar for anyone who can author content.
- Administrators can now register patients, alongside front desk and
  clinical staff. The sidebar has a "Back to website" link.
- Editing a website service now opens its own screen
  (/admin/service-pages/<id>) with every field prefilled; Back returns to
  the list.

## July 2026 Update — Scheduling

### For Staff

- A Schedule view with day and week modes, filtered by provider and
  location. Each row shows the patient, appointment type, provider,
  readiness, and status — no clinical details on the schedule itself.
- Book appointments from a patient's chart. Only genuinely open times are
  offered, and the time is re-checked at the moment you confirm, so two
  staff members cannot book the same slot.
- Booking automatically assigns the intake and consent forms that the
  appointment type requires. Re-running or rescheduling never duplicates
  them.
- Appointment actions: confirm, check in, start, complete, cancel, and
  mark no-show. Cancellations and no-shows require a reason. Every change
  is kept in the appointment's history.
- Rescheduling keeps the original appointment on record (cancelled, with
  the reason) and links it to the new one.
- A Waitlist for patients who need a time you cannot offer yet. Log contact
  attempts, then convert an entry into a real appointment using the same
  conflict checks as normal booking.

### For Administrators

- Configure locations (with their time zone), services, and appointment
  types, including duration, buffers, eligible providers, and location.
- Set provider working hours — recurring weekly or one-off dates — and
  block time off. Overlapping or contradictory configuration is rejected.
- All scheduling configuration changes are audited.

### For Patients

- The portal now lists upcoming and past appointments with date, time, type,
  and location. Cancelling online is available only for appointment types
  the practice has enabled for self-service; otherwise the portal directs
  the patient to call.

Appointment times are stored with the location's time zone and survive
daylight-saving changes.

## July 2026 Update

### Patient Portal

- Patients can now activate their portal account using an invitation from
  the front desk. Invitations expire after 7 days and can only be used once.
- After signing in, patients see a personal home page with a checklist of
  what still needs to be completed, plus practice contact information.
- Patients can update their own contact details: preferred name, phone,
  email, home address, emergency contact, communication preferences, and
  preferred pharmacy. Legal name and date of birth stay staff-managed.
- Patients can fill out assigned intake forms — save a draft, come back
  later, and submit when done — and review and sign consent forms online.

### For Staff

- Send portal invitations to patients and revoke them if needed.
- A new Readiness indicator on each patient chart shows exactly what is
  still missing (profile details, forms, consents) before a visit.
- The chart's Intake tab shows every assigned form, who assigned it, and
  its status, with the option to waive a requirement (a reason is required).

### For Administrators

- Build and publish your own intake and consent forms — no developer
  needed. Published versions are locked; changes go out as a new version.
- Set assignment rules so the right forms are automatically assigned to
  the right patients.

All changes are recorded in the audit log, and signed forms and consents
can never be altered after submission.
