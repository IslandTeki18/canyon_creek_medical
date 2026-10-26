# Canyon Creek Ubiquitous Language

Canyon Creek is a public website and content administration application for an integrative mental health, addiction medicine, and ketamine clinic. This glossary defines the terms the code, docs, and conversations must share. Definitions describe what a thing IS; behavior and implementation live in `docs/` and `convex/`.

Derived from `convex/schema.ts`, `convex/lib/permissions.ts`, `convex/lib/access.ts`, and `docs/ADMINISTRATION.md` on 2026-10-26.

---

## Identity and access

**User**:
One authentication identity (a Clerk account) known to the practice. Soft-deactivated, never deleted.
_Avoid_: account, login, member

**Role**:
A named category assigned to a user: administrator. Roles exist only to derive capabilities.
_Avoid_: permission level, group

**Capability**:
A named permission such as `config.manage` or `content.author`. Every server-side authorization decision checks a capability, never a role label.
_Avoid_: permission, right, scope

**Audit Event**:
An append-only record of a sensitive read, write, role change, export, or override, with a typed reason and a derived severity. Never edited or deleted.
_Avoid_: log entry, activity

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

## Inquiries

**Contact Inquiry**:
A message a website visitor submitted through the public contact form, with their name, email, optional phone and free text. Stored for staff follow-up, status new | handled | archived, archived with a reason, never deleted.
_Avoid_: lead, ticket, message thread.

---

## Cross-cutting concepts

**PHI (protected health information)**:
Any patient-identifying or clinical detail. Never in URLs, logs, analytics, filenames, or notification bodies.

**Immutable Record**:
A row that is never edited after a terminal state: signed notes, consents, published versions, audit events, lifecycle events. Change is expressed by amendment, supersession, or a new version.

**Archive**:
The only removal path for clinical and content records. Soft, reasoned, audited.
_Avoid_: delete, remove

**Reason**:
Required operational text attached to overrides, cancellations, archives, blocks, exports, and flag changes. Never PHI.

**Deferred Feature**:
Functionality outside the current scope: patient portal, clinical charting, scheduling, booking, intake forms, communications, workforce management, reporting, secure messaging, billing, e-prescribing, Spravato, HBOT, peptides, multi-location.

**Synthetic Data**:
Fabricated records used everywhere except production.
