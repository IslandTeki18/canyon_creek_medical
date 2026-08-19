---
title: Service catalog is config, not content
map: ../MAP.md
type: wayfinder:grilling
status: closed
closed: 2026-08-05
resolution: out-of-scope
assignee: Landon McKell
blocked-by: []
---

## Question

The service catalog was pulled into scope alongside the three content
editors, but it is a different animal. It has no create form at all — the page
says "Add one from scheduling configuration" — and its writes carry
operational consequences: changing a status can cancel future patient
appointments.

- Does the catalog get the card treatment, or does its dependency information
  (appointment types, reminders, forms, resources, providers) need a denser
  view than a card allows?
- Should creating a service move here from scheduling configuration, so the
  founder has one place for services? That is a real IA change, not a layout
  one.
- Given the appointment-cancellation consequence, does this page want _more_
  friction rather than less, running against the simplify-everything goal?
- Is the overlap between a clinical "service" and a website "service page"
  confusing to the founder, given they are separate records with separate
  admin pages and similar names?

If this turns out to sit past the destination, rule it out of scope rather
than resolving it.

## Outcome: ruled out of scope, with one decision kept

### The catalog rework is out of scope

It is not content, and three facts settle it:

- **It has no content model.** No draft, no publish, no `draftContent`, no
  sections. Every decision this map has made is inapplicable to it.
- **Its detail does not fit a card.** Each service expands to its appointment
  types with providers, reminders, forms, and resource requirements, plus a
  live alert when a required resource has no active resource at a location
  ("bookings will fail", `service-catalog-page.tsx:255-262`). Compressing that
  into a card would hide operational information a practice depends on.
- **Its writes are consequential.** Changing a status can cancel future
  patient appointments. This page wants _more_ friction, not less, which runs
  against the goal of the effort.

The frontier stops here. Revisiting it means a fresh effort with its own
destination, not a resumption of this map.

**Still in scope:** replacing the catalog's `window.prompt` and
`window.confirm`, which
[Replacing the browser prompts](05-replacing-browser-prompts.md) already
covers — including the confirm that decides whether future appointments are
cancelled.

### Service creation stays in scheduling configuration

Not moved into the catalog. A clinical service is meaningless without
appointment types, durations, and providers, which is what the scheduling
config page exists to set up (`convex/domains/scheduling.ts:171`). Moving
creation would let the founder make a bare service with nothing attached.

### Decision kept in scope: rename the admin surfaces

A clinical `services` record and a website `servicePages` record are different
things with nearly identical names, on two adjacent admin pages. The admin
navigation and headings get distinct labels — along the lines of **Bookable
services** versus **Website services**.

Admin labels only: no data change, no table rename, no new relationship
between the two records. Linking a website service page to the clinical
service it describes was considered and rejected as a much larger change than
this effort's destination supports.
