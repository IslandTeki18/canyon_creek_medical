# Integrative Mental Health, Addiction Medicine & Holistic Care Practice

## Product Requirements and Technical Specification

**Platform:** Patient Portal, Clinical Operations, Scheduling, Communications, and Practice Administration  
**Target Stack:** React, TypeScript, Tailwind CSS, shadcn/ui, Convex, Clerk, Twilio, and Resend  
**Version:** 1.0  
**Date:** July 2026

---

# Document Control

| **Document purpose**     | Developer handoff specification for designing and implementing the practice platform.                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Primary audience**     | Product owner, software developers, UI/UX designers, QA, security/compliance reviewers, and implementation partners. |
| **Status**               | Initial build specification; business, clinical, legal, and compliance review required before production launch.     |
| **Product type**         | Responsive web application with patient, provider, staff, and administrator experiences.                             |
| **Assumed launch model** | Single medical practice with future support for multiple locations and service expansion.                            |

**Important boundary:** This document defines software behavior and operational requirements. Clinical protocols, prescribing rules, controlled-substance workflows, consent language, billing rules, and regulatory interpretations must be approved by qualified medical, legal, privacy, and compliance professionals before deployment.

# Table of Contents

- 1. Executive Summary
- 2. Product Goals and Success Criteria
- 3. Scope and Delivery Phases
- 4. Users, Roles, and Permissions
- 5. Core User Journeys
- 6. Functional Requirements
- 7. Service-Specific Clinical Workflows
- 8. Scheduling and Appointment Management
- 9. Communications and Reminders
- 10. Patient Records and Documentation
- 11. Billing and Payments
- 12. Administration and Configuration
- 13. Data Model
- 14. Architecture and Technology
- 15. Security, Privacy, and Compliance
- 16. Nonfunctional Requirements
- 17. UX and Design System
- 18. Analytics and Reporting
- 19. Testing and Quality Assurance
- 20. Deployment and Operations
- 21. Acceptance Criteria
- 22. Open Decisions and Future Expansion

# 1. Executive Summary

The product is a secure, responsive clinical practice platform for an outpatient medical clinic specializing in mental health care, medication management, addiction medicine, medication-assisted treatment, ketamine therapy, and integrative care. The initial release should reduce administrative work, improve patient communication, standardize intake and appointment workflows, and give patients a clear digital experience from registration through ongoing care.

The platform will provide four connected experiences: a public-facing practice website and service inquiry flow, a patient portal, a provider/staff workspace, and an administrative control center. The architecture must support future services such as Spravato, hyperbaric oxygen therapy, peptide therapy, additional locations, and expanded clinical teams without requiring a complete rebuild.

## 1.1 Product Principles

- Patient-centered and low-friction: every workflow should minimize confusion, repeated data entry, and unnecessary phone calls.
- Clinically structured but configurable: core workflows should be standardized while allowing authorized administrators to configure services, forms, appointment types, reminders, and eligibility rules.
- Secure by default: least-privilege access, comprehensive audit trails, encrypted data handling, and privacy-aware communications are mandatory.
- Operationally efficient: the system should automate routine reminders, intake collection, follow-up tasks, and status tracking.
- Expansion-ready: service-specific workflows should be modular so future therapies can be added without disrupting existing care.

# 2. Product Goals and Success Criteria

## 2.1 Primary Goals

- Enable secure patient registration, identity verification, intake completion, consent collection, and portal access.
- Allow staff to manage patient inquiries, referrals, appointments, documentation status, reminders, and follow-up tasks from one workspace.
- Allow providers to review longitudinal patient information, complete structured clinical notes, manage medications, and document treatment plans.
- Support specialized workflows for MAT and ketamine therapy while keeping clinical decision-making under provider control.
- Create a configurable foundation for Spravato, HBOT, peptide therapy, and additional wellness services.

## 2.2 Initial Success Metrics

- At least 80% of scheduled new patients complete required intake forms before the appointment.
- Reduction in manual reminder calls and texts through automated SMS and email workflows.
- Staff can identify every appointment’s intake, consent, payment, and clinical readiness status from one screen.
- Every access or modification to sensitive patient information is attributable to an authenticated user and timestamped.
- New appointment types and service forms can be configured without code changes for ordinary operational updates.

# 3. Scope and Delivery Phases

## 3.1 Phase 1 — Operational MVP

- Public service pages, inquiry form, and request-an-appointment flow.
- Clerk authentication with patient, provider, staff, and administrator roles.
- Patient profile, demographics, emergency contact, insurance capture, preferred pharmacy, and communication preferences.
- Configurable digital intake forms, questionnaires, consents, and signatures.
- Appointment scheduling, staff booking, rescheduling, cancellation, waitlist, and appointment status tracking.
- Twilio SMS and Resend email confirmations, reminders, and operational notifications.
- Provider/staff dashboard with patient search, appointment queue, readiness status, tasks, and notes.
- Medication list, allergies, diagnoses, treatment plans, encounter notes, and document uploads.
- Basic MAT and ketamine workflow support.
- Audit log, role-based permissions, session controls, data export, and retention configuration.

## 3.2 Phase 2 — Clinical and Revenue Expansion

- Recurring appointments and series scheduling.
- Integrated payment collection, invoices, superbills, and insurance workflow support.
- E-prescribing or EHR integration through an approved third-party vendor.
- Laboratory order/result integrations and toxicology result tracking.
- Secure patient-provider messaging.
- Outcome measurement dashboards and standardized symptom score trends.
- Spravato workflow module after certification and clinical approval.

## 3.3 Phase 3 — Regenerative and Multi-Location Platform

- HBOT session protocols, chamber scheduling, treatment series, safety checklists, and session monitoring.
- Peptide therapy intake, consent, protocol tracking, dispensing coordination, and follow-up.
- Multi-location scheduling, resources, rooms, equipment, and location-specific configuration.
- Referral partner portal and care coordination workflows.
- Advanced analytics, campaign attribution, and capacity forecasting.

## 3.4 Explicitly Out of Scope for the Initial MVP

- Building a custom e-prescribing network.
- Automated clinical diagnosis or autonomous treatment recommendations.
- Automated determination of controlled-substance eligibility.
- Direct insurance claims submission unless a clearinghouse integration is separately approved.
- Replacing legally required emergency services or crisis response systems.
- Storage of payment card data within Convex.

# 4. Users, Roles, and Permissions

| **Role**                    | **Core Access**                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Patient**                 | Manages their own profile, forms, appointments, communications, documents, statements, and approved care information.               |
| **Provider**                | Reviews assigned patients, documents encounters, manages diagnoses, medications, treatment plans, orders, and follow-up.            |
| **Clinical Staff**          | Supports clinical workflows, collects vitals and screenings, prepares charts, documents within authorized scope, and manages tasks. |
| **Front Desk / Operations** | Manages inquiries, registration, scheduling, forms, reminders, demographic information, payments, and administrative tasks.         |
| **Practice Administrator**  | Configures users, permissions, services, forms, appointment types, templates, locations, reporting, and operational settings.       |
| **Compliance / Auditor**    | Read-only access to approved records, audit logs, access reports, exports, and compliance evidence.                                 |
| **System Integration**      | Restricted service identity used only for approved integrations and background jobs.                                                |

## 4.1 Permission Model

- Use role-based access control with explicit permissions rather than role names alone.
- Support scope restrictions by assigned provider, care team, location, and job function.
- Sensitive actions require elevated permissions: record export, user impersonation, deletion, permission changes, controlled-substance-related documentation, and audit-log access.
- Patients can access only their own information unless an approved proxy or guardian relationship exists.
- Break-glass access, if implemented, must require a reason and create a high-priority audit event.

# 5. Core User Journeys

## 5.1 New Patient Journey

1. Patient discovers a service and submits an inquiry or appointment request.
1. Staff reviews the request, selects an appointment type, and creates or invites the patient.
1. Patient activates a Clerk account using a secure invitation.
1. Patient completes demographics, communication preferences, insurance/self-pay information, pharmacy, medical history, medications, allergies, substance-use history, risk screening, service-specific forms, and required consents.
1. System marks the appointment as ready or identifies missing requirements.
1. Patient receives confirmation and reminder messages that exclude sensitive clinical details.
1. Provider reviews the chart and conducts the encounter.
1. Provider records assessment, plan, medications, education, follow-up, and tasks.
1. Patient receives approved after-visit information and follow-up scheduling instructions.

## 5.2 Returning Patient Journey

1. Patient signs in, confirms profile information, and completes interval questionnaires.
1. Patient schedules or confirms a follow-up appointment.
1. System collects appointment-specific forms and updates readiness status.
1. Provider reviews trends, medication response, side effects, adherence, risk status, and previous plan.
1. Provider updates the treatment plan and schedules the next follow-up.

## 5.3 Staff Daily Operations Journey

1. Open daily operations dashboard.
1. Review new inquiries, unconfirmed appointments, incomplete intake, unpaid balances, pending authorizations, and unresolved tasks.
1. Contact patients using approved templates and communication channels.
1. Update appointment statuses and assign tasks.
1. Escalate clinical questions to providers without placing sensitive details in ordinary SMS or email.

# 6. Functional Requirements

## 6.1 Authentication and Account Management

| **ID**  | **Priority** | **Requirement**                                                                                                                         | **Acceptance Summary**                                                                               |
| ------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| AUTH-01 | Must         | Use Clerk for user authentication, session management, passwordless or password-based sign-in, and optional multifactor authentication. | Users can securely sign in and sign out; inactive or revoked accounts cannot access the application. |
| AUTH-02 | Must         | Map Clerk users to an internal Convex user profile and permission set.                                                                  | Every authenticated request resolves to one active internal user and authorized scope.               |
| AUTH-03 | Must         | Support invitation-based account activation for patients and workforce users.                                                           | Invitations expire, can be revoked, and cannot be reused after acceptance.                           |
| AUTH-04 | Must         | Support account recovery and verified changes to email or phone number.                                                                 | Identity changes require re-verification and are audited.                                            |
| AUTH-05 | Should       | Support MFA enforcement by role, with stronger requirements for workforce users.                                                        | Administrators can require MFA for selected roles.                                                   |

## 6.2 Patient Registration and Profile

| **ID** | **Priority** | **Requirement**                                                                                                                                                                                   | **Acceptance Summary**                                                       |
| ------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| PAT-01 | Must         | Store legal name, preferred name, date of birth, sex-related administrative data where required, pronouns where desired, address, email, phone, emergency contact, and communication preferences. | Authorized users can create and update profiles with field-level validation. |
| PAT-02 | Must         | Support preferred pharmacy, primary care provider, referring provider, insurance details, guarantor, and self-pay status.                                                                         | Staff can view registration completeness and missing fields.                 |
| PAT-03 | Must         | Support patient status values such as lead, invited, active, inactive, discharged, deceased, and archived.                                                                                        | Status controls available actions without deleting clinical history.         |
| PAT-04 | Should       | Support guardian, caregiver, and proxy relationships with configurable access.                                                                                                                    | Authorized representatives have limited, auditable access.                   |

## 6.3 Forms, Questionnaires, and Consent

| **ID**  | **Priority** | **Requirement**                                                                                                                   | **Acceptance Summary**                                                                 |
| ------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| FORM-01 | Must         | Provide a configurable form builder for intake, follow-up, screening, consent, and service-specific forms.                        | Administrators can publish versioned forms with required fields and conditional logic. |
| FORM-02 | Must         | Support text, number, date, single-select, multi-select, yes/no, rating scale, signature, file upload, and acknowledgment fields. | All supported fields persist correctly and render on desktop and mobile.               |
| FORM-03 | Must         | Version every form and preserve the exact version completed by the patient.                                                       | Historical submissions remain unchanged after a template update.                       |
| FORM-04 | Must         | Record signer identity, timestamp, form version, and signature metadata.                                                          | Consent records are attributable and exportable.                                       |
| FORM-05 | Should       | Support scored assessments with configurable calculation rules and severity bands.                                                | Authorized users can view score history without changing submitted answers.            |

## 6.4 Tasks and Work Queues

| **ID**  | **Priority** | **Requirement**                                                                                                                           | **Acceptance Summary**                                                       |
| ------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| TASK-01 | Must         | Create staff tasks linked to patients, appointments, forms, documents, or encounters.                                                     | Tasks have owner, due date, status, priority, type, and audit history.       |
| TASK-02 | Must         | Provide role-specific queues for new inquiries, incomplete intake, clinical review, follow-up, authorizations, and failed communications. | Users can filter, sort, assign, and resolve queue items.                     |
| TASK-03 | Should       | Generate tasks automatically from configurable workflow events.                                                                           | Defined events create one nonduplicate task with the correct owner or queue. |

# 7. Service-Specific Clinical Workflows

The software must support documentation and operational coordination without making autonomous clinical decisions. Every eligibility determination, diagnosis, medication decision, and treatment approval remains the responsibility of an authorized clinician.

## 7.1 Mental Health and Medication Management

- Initial psychiatric evaluation template covering presenting concerns, psychiatric history, medical history, family history, medications, allergies, substance-use history, sleep, trauma, social factors, mental status examination, risk assessment, diagnosis, and plan.
- Follow-up template for symptom change, adherence, effectiveness, side effects, sleep, functioning, risk status, medication changes, education, and follow-up interval.
- Longitudinal tracking of diagnoses, active/inactive medications, allergies, adverse reactions, standardized assessment scores, and treatment goals.
- Medication records must support name, dose, route, frequency, indication, start/end dates, prescriber, status, and discontinuation reason.
- The platform should not represent itself as the legal prescription system unless connected to an approved e-prescribing service.

## 7.2 Addiction Medicine and MAT

- Service-specific intake for substances used, route, frequency, last use, overdose history, previous treatment, withdrawal history, recovery supports, and co-occurring conditions.
- MAT treatment plan supporting medication type, induction or maintenance stage, follow-up cadence, counseling coordination, toxicology plan, recovery goals, and relapse-prevention planning.
- Track buprenorphine, long-acting buprenorphine injections, naltrexone, and other approved treatment medications as configurable medication protocols.
- Record toxicology orders and results manually or through a future integration, including specimen date, result status, interpretation, and provider acknowledgment.
- Support controlled-document access restrictions and prominent auditing for sensitive workflows.
- Provide naloxone education and other practice-defined safety education tracking without automating medical conclusions.

## 7.3 Ketamine Therapy

- Candidate evaluation workflow with medical and psychiatric review, contraindication checklist, informed consent, baseline assessments, transportation confirmation, and provider approval.
- Treatment-series plan with configurable number of sessions, route, dose documentation, appointment duration, monitoring requirements, and reassessment milestones.
- Session record with pre-treatment checklist, baseline vitals, medication details, administration time, intra-session observations, repeat vitals, adverse events, discharge criteria, escort confirmation, and post-treatment instructions.
- Resource scheduling for treatment room and monitoring capacity.
- Hard stop when required consent, approval, or transportation confirmation is incomplete; authorized clinicians may override only with documented reason when policy allows.

## 7.4 Future Spravato Module

- Feature-flagged and unavailable until practice leadership confirms certification and operational readiness.
- Support enrollment or verification status, treatment authorization status, dose/session documentation, observation period, vital signs, discharge readiness, and required program records.
- Workflow must be configurable to current manufacturer, program, and regulatory requirements at implementation time.

## 7.5 Holistic and Integrative Care

- Structured lifestyle assessment for sleep, nutrition, movement, stress, substance use, social environment, and patient goals.
- Care-plan actions such as sleep goals, nutritional guidance, exercise goals, stress-reduction practices, referrals, and follow-up measurements.
- Supplement list with name, dose, frequency, source, start/end dates, reported benefit, and adverse effects.
- Clear separation between patient-reported information, provider recommendations, and externally prescribed treatment.

## 7.6 Future HBOT and Peptide Modules

- HBOT: resource-based scheduling, treatment course, approved indication, pre-session safety checklist, chamber/session data, vitals, adverse events, and completion status.
- Peptides: eligibility review, consent, protocol, medication/supply tracking, follow-up, outcomes, adverse effects, and external pharmacy coordination.
- Both modules must be feature-flagged and require approved clinical protocols before activation.

# 8. Scheduling and Appointment Management

| **ID** | **Priority** | **Requirement**                                                                                                                                                      | **Acceptance Summary**                                                               |
| ------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| SCH-01 | Must         | Configure appointment types by service, duration, eligible providers, location, room/resource, price, required forms, and cancellation policy.                       | Administrators can create and deactivate appointment types without deleting history. |
| SCH-02 | Must         | Support staff-created appointments, patient requests, confirmations, rescheduling, cancellation, no-show, checked-in, in-progress, completed, and canceled statuses. | Status changes are timestamped and reflected in dashboards.                          |
| SCH-03 | Must         | Prevent double booking of providers and exclusive resources unless an authorized override is documented.                                                             | Conflicts are detected before save.                                                  |
| SCH-04 | Must         | Show readiness indicators for registration, forms, consents, payment, authorization, transport/escort, and clinical approval.                                        | Staff can identify missing requirements from the schedule view.                      |
| SCH-05 | Should       | Support waitlist entries and staff-assisted placement into canceled slots.                                                                                           | Openings can be matched to eligible waitlist patients.                               |
| SCH-06 | Should       | Support recurring or series appointments for MAT follow-up, ketamine treatment series, and future HBOT.                                                              | Series changes can affect one appointment or remaining appointments.                 |
| SCH-07 | Could        | Support external calendar synchronization after privacy and integration review.                                                                                      | Approved calendar details synchronize without exposing unnecessary PHI.              |

# 9. Communications and Reminders

## 9.1 Channels

- Twilio for SMS delivery and status callbacks.
- Resend for transactional email delivery and event callbacks.
- In-app notifications for authenticated users.
- Optional secure portal messaging in a later phase.

## 9.2 Required Message Types

- Account invitation and activation.
- Appointment confirmation, reminder, reschedule, cancellation, and waitlist opening.
- Incomplete intake or unsigned consent reminder.
- Payment receipt or balance notice.
- Document availability notification.
- Failed-delivery and staff follow-up alerts.
- Internal task and escalation notifications.

## 9.3 Communication Rules

- Do not include diagnosis, medication, substance-use details, treatment type, or other sensitive clinical information in ordinary SMS or email unless specifically approved through policy and consent.
- Use neutral wording such as “appointment with the practice” and direct the patient to the secure portal for details.
- Record consent status and channel preferences; support opt-out processing while preserving legally permitted operational messages.
- Store message template version, recipient, channel, send time, delivery status, failure reason, and related patient or appointment.
- Retry transient failures with bounded retries and move permanent failures into a staff queue.
- Use idempotency keys to prevent duplicate reminders.

# 10. Patient Records and Documentation

- Patient summary: demographics, alerts, allergies, medications, diagnoses, care team, appointments, forms, scores, documents, tasks, and recent encounters.
- Encounter notes: draft, signed, amended, and locked states. Signed notes cannot be silently edited; amendments preserve original content and reason.
- Documents: secure upload, type, date, source, author, patient visibility, review status, and version metadata.
- Clinical alerts: configurable severity, effective dates, author, reason, and acknowledgment.
- After-visit summary: only provider-approved content visible to the patient.
- Record export: authorized PDF or structured export with audit logging and configurable scope.
- Deletion: clinical records should ordinarily be archived or corrected rather than hard deleted; retention and legal-hold policies must be configurable.

# 11. Billing and Payments

The payment provider is not specified in the requested stack. The implementation should define a payment abstraction and use a compliant third-party processor. The application must never store raw card numbers or security codes.

- Track self-pay price, deposit, amount due, payment status, refund status, and receipt.
- Support appointment-level payment requirements and administrative overrides with reasons.
- Store insurance policy information and authorization status without claiming full claims-processing capability.
- Support future superbill generation and export.
- Keep clinical access separate from ordinary payment status where law or emergency-care policy requires.

# 12. Administration and Configuration

- User and role management.
- Locations, hours, time zones, rooms, equipment, and resources.
- Services and appointment types.
- Provider availability, time off, and scheduling rules.
- Form templates, consent templates, scoring rules, and version publishing.
- Message templates, reminder schedules, quiet hours, and sender identities.
- Task types, queues, priorities, and routing rules.
- Feature flags for future services and integrations.
- Branding, practice contact information, portal notices, and emergency disclaimer content.
- Data retention, export, inactivity, and audit review settings.

# 13. Conceptual Data Model

| **Entity**                         | **Purpose**                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **users**                          | Internal user profile linked to Clerk identity, status, role assignments, location scope, and preferences. |
| **patients**                       | Patient master record, demographics, status, contacts, preferences, and administrative identifiers.        |
| **patientRelationships**           | Guardian, proxy, caregiver, guarantor, and related-person relationships.                                   |
| **providers**                      | Provider profile, credentials metadata, specialties, services, locations, and availability settings.       |
| **roles / permissions**            | Permission definitions, role bundles, assignments, and scope constraints.                                  |
| **services**                       | Mental health, medication management, MAT, ketamine, holistic care, and future service definitions.        |
| **appointmentTypes**               | Duration, service, provider/resource eligibility, price, required forms, and reminder policy.              |
| **appointments**                   | Patient, provider, service, location, resources, times, status, readiness, and cancellation data.          |
| **availability / timeOff**         | Recurring availability, exceptions, holidays, and blocked time.                                            |
| **formTemplates / formVersions**   | Configurable schema, conditional logic, scoring, publishing status, and immutable versions.                |
| **formSubmissions**                | Answers, calculated scores, completion state, signer, timestamps, and version reference.                   |
| **consents**                       | Consent type, version, signer, signature metadata, status, and revocation where applicable.                |
| **encounters**                     | Visit record, type, participants, status, note sections, sign/amend metadata.                              |
| **diagnoses**                      | Patient diagnosis history, status, dates, provider, and coded values where applicable.                     |
| **medications**                    | Patient-reported and provider-managed medication history with status and source.                           |
| **allergies**                      | Allergen, reaction, severity, source, and verification status.                                             |
| **treatmentPlans**                 | Problems, goals, interventions, responsible party, target dates, and review status.                        |
| **assessments**                    | Instrument, answers, score, severity, administration date, and trend metadata.                             |
| **matEpisodes**                    | MAT episode, medication/protocol, stage, monitoring plan, counseling coordination, and status.             |
| **treatmentSeries**                | Ketamine, future Spravato, HBOT, or other multi-session plan.                                              |
| **treatmentSessions**              | Session-specific checklist, administration, monitoring, adverse event, and discharge data.                 |
| **documents**                      | Storage reference, metadata, access policy, visibility, review, and version.                               |
| **tasks**                          | Operational or clinical work item with owner/queue, priority, due date, and status.                        |
| **communications**                 | Template, channel, recipient, content classification, status, provider IDs, and event history.             |
| **billingAccounts / transactions** | Balances, charges, payments, refunds, processor references, and receipts.                                  |
| **auditEvents**                    | Actor, action, entity, record ID, timestamp, reason, source, and before/after metadata where appropriate.  |
| **featureFlags**                   | Controlled activation of modules, locations, users, and environments.                                      |

# 14. Architecture and Technology

## 14.1 Frontend

- React with TypeScript in strict mode.
- Tailwind CSS for styling and shadcn/ui for accessible composable primitives.
- Feature-oriented project structure separating domain modules, shared UI, hooks, validation, permissions, and integrations.
- React Hook Form with a schema-validation library such as Zod for forms.
- Responsive desktop-first clinical workspace and mobile-friendly patient portal.
- Route-level authorization and component-level permission gates.

## 14.2 Backend and Data

- Convex for database, queries, mutations, actions, scheduled jobs, file references, and real-time subscriptions.
- All mutations must validate authorization and input server-side; client checks are not sufficient.
- Use internal actions for privileged integration work and webhook processing.
- Define indexes for common access patterns such as patient search, appointments by date/provider/location, tasks by queue/status, and communications by status.
- Use soft-deactivation or archival fields where data must remain for history.
- Use explicit idempotency records for external webhooks, reminders, payments, and long-running workflows.

## 14.3 Integrations

- Clerk webhooks synchronize user creation, updates, and revocation.
- Twilio sends SMS and returns delivery status through signed webhook endpoints.
- Resend sends transactional email and returns delivery events through verified webhook endpoints.
- Future integrations must use isolated adapter modules and avoid leaking vendor-specific fields throughout domain logic.
- Secrets are stored only in environment configuration and never exposed to client bundles.

## 14.4 Recommended Project Structure

> src/  
> app/ \# routing, providers, layouts  
> features/  
> auth/  
> patients/  
> scheduling/  
> intake/  
> encounters/  
> medications/  
> mat/  
> ketamine/  
> communications/  
> billing/  
> administration/  
> components/ \# shared components and shadcn/ui wrappers  
> lib/ \# validation, permissions, formatting, utilities  
> integrations/ \# Clerk, Twilio, Resend, payment adapters  
> types/  
> convex/  
> schema.ts  
> auth.config.ts  
> patients.ts  
> appointments.ts  
> forms.ts  
> encounters.ts  
> communications.ts  
> scheduledJobs.ts  
> webhooks/  
> lib/ \# authorization, audit, validation, idempotency

# 15. Security, Privacy, and Compliance

- Before production use, confirm that every vendor handling protected health information is configured under appropriate contractual and security terms, including required business associate agreements where applicable.
- Apply least-privilege authorization in every Convex query, mutation, action, scheduled job, export, and webhook flow.
- Encrypt data in transit; confirm encryption at rest for all production systems and backups.
- Do not place sensitive patient information in URLs, browser logs, analytics payloads, ordinary SMS, or email subject lines.
- Maintain audit events for authentication, record viewing where required, creation, modification, signing, amendment, export, permission changes, break-glass access, and integration activity.
- Use inactivity timeouts, session revocation, MFA for workforce users, secure cookie/session settings, and device/session review.
- Implement secure file-upload restrictions, malware scanning strategy, content-type validation, size limits, and access-controlled download URLs.
- Validate webhook signatures, reject replay attempts, and process external events idempotently.
- Use separate development, staging, and production environments with synthetic data outside production.
- Establish incident-response, breach-response, backup, recovery, retention, legal-hold, and workforce offboarding procedures.
- Complete a formal privacy, security, and regulatory review before launch, including state-specific requirements and special handling of substance-use-disorder records where applicable.

# 16. Nonfunctional Requirements

| **ID** | **Priority** | **Requirement**                                                                                                             | **Acceptance Summary**                                                                    |
| ------ | ------------ | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| NFR-01 | Must         | Core pages should load usable content quickly on ordinary broadband and current mobile connections.                         | Performance budgets are defined and measured in CI or release checks.                     |
| NFR-02 | Must         | The application must support current evergreen desktop and mobile browsers.                                                 | Critical workflows pass browser compatibility testing.                                    |
| NFR-03 | Must         | Meet WCAG 2.2 AA-oriented accessibility requirements for keyboard use, labels, focus, contrast, errors, and screen readers. | Automated and manual accessibility checks pass agreed criteria.                           |
| NFR-04 | Must         | All dates and times must be timezone-aware and stored consistently.                                                         | Appointments render correctly across daylight-saving transitions and location time zones. |
| NFR-05 | Must         | Critical mutations and external events must be idempotent.                                                                  | Retries do not create duplicate appointments, messages, payments, or tasks.               |
| NFR-06 | Must         | Provide structured error logging and alerting without exposing sensitive data.                                              | Production errors can be traced using correlation IDs and redacted context.               |
| NFR-07 | Should       | Support graceful degradation when SMS or email providers are unavailable.                                                   | Clinical records remain usable and failed notifications enter a retry or staff queue.     |
| NFR-08 | Should       | Define backup and recovery objectives before launch.                                                                        | Restore procedures are documented and tested.                                             |

# 17. UX and Design System

- Use a calm, professional visual system with strong readability and minimal cognitive load.
- Patient portal language should be plain, supportive, and nonjudgmental.
- Clinical dashboards should prioritize status, risk flags, incomplete work, and next actions rather than decorative metrics.
- Use consistent badges for appointment, form, consent, payment, and task statuses.
- Never rely on color alone to convey state.
- Use confirmation dialogs and typed reasons for destructive, override, sign, amend, export, and permission-changing actions.
- Support autosave for long clinical and intake forms, with visible saved state and conflict handling.
- Do not use infinite scrolling for clinical records where pagination or bounded timelines improve orientation.

# 18. Analytics and Reporting

- Appointment volume, cancellation, no-show, reschedule, and completion rates.
- Lead-to-appointment conversion by source and service.
- Intake completion and consent completion rates.
- Provider capacity and schedule utilization.
- Reminder delivery and failure rates by channel.
- Task backlog by queue, priority, owner, and age.
- Treatment-series attendance and completion.
- Outcome assessment trends at patient and aggregate levels with access restrictions.
- Revenue, outstanding balances, refunds, and service mix after payment integration.
- Audit and access reports for compliance review.

# 19. Testing and Quality Assurance

- Unit tests for validation, permission rules, scoring, schedule conflict logic, readiness calculation, and communication eligibility.
- Integration tests for Convex functions, Clerk user synchronization, Twilio and Resend webhooks, file access, and scheduled reminders.
- End-to-end tests for patient invitation, intake, scheduling, reminder delivery, check-in, provider documentation, note signing, amendment, and export.
- Role-matrix tests proving each role can and cannot access defined data and actions.
- Security tests for direct-object reference attacks, privilege escalation, session revocation, malicious file uploads, webhook spoofing, and sensitive-data leakage.
- Accessibility testing using automated tooling plus keyboard and screen-reader checks for critical workflows.
- Use synthetic test patients; production data must not be copied into lower environments without an approved de-identification process.

# 20. Deployment and Operations

- Separate development, staging, and production Clerk instances, Convex deployments, Twilio configuration, Resend configuration, and secrets.
- Automated CI checks for formatting, type checking, linting, tests, build, dependency review, and migration safety.
- Controlled deployment with release notes, rollback procedure, feature flags, and post-release smoke tests.
- Scheduled-job monitoring for reminders and maintenance tasks.
- Webhook dead-letter or failure queue with replay tooling restricted to administrators.
- Operational dashboard for integration health, failed jobs, delivery failures, and recent high-severity audit events.
- Documented user onboarding, offboarding, permission review, incident response, downtime procedures, and support escalation.

# 21. MVP Acceptance Criteria

| **Area**                     | **Acceptance Condition**                                                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Account and access**       | A patient can accept an invitation, authenticate, and access only their own portal. Workforce users can access only permitted patients, locations, and functions. |
| **Patient onboarding**       | A new patient can complete all configured required forms and consents, save progress, sign, and see completion status.                                            |
| **Scheduling**               | Staff can create, reschedule, cancel, check in, and complete appointments without double-booking restricted resources.                                            |
| **Readiness**                | The schedule clearly identifies missing registration, forms, consent, payment, authorization, and service-specific requirements.                                  |
| **Reminders**                | The system sends configured neutral SMS and email reminders once, records delivery status, and queues failures.                                                   |
| **Clinical record**          | Authorized staff can review patient information; providers can create, sign, and amend encounter notes with complete history.                                     |
| **Medication and diagnosis** | Authorized providers can maintain medication, allergy, diagnosis, assessment, and treatment-plan history.                                                         |
| **MAT workflow**             | Authorized users can record MAT episode data, monitoring plans, follow-up, and results without exposing data to unauthorized roles.                               |
| **Ketamine workflow**        | Authorized users can manage candidate approval, treatment series, session monitoring, and discharge documentation.                                                |
| **Auditability**             | Critical access and change events are recorded with actor, time, action, entity, and reason where required.                                                       |
| **Administration**           | Administrators can configure services, appointment types, forms, reminder schedules, templates, locations, and permissions.                                       |
| **Quality**                  | Critical flows pass agreed functional, permission, security, accessibility, and responsive-layout testing.                                                        |

# 22. Open Decisions and Future Expansion

## 22.1 Decisions Required Before Development

- Practice name, brand identity, legal entity, locations, operating hours, and initial provider/staff roster.
- Exact MVP boundary: marketing website only, patient portal, internal clinical workspace, or all components.
- Whether patients may self-schedule, request appointments, or only schedule through staff.
- Payment processor, self-pay policies, cancellation fees, deposits, insurance workflow, and superbill requirements.
- Clinical documentation templates and which standardized assessments are required by service.
- Telehealth requirements and selected video platform.
- Whether secure patient messaging is required in the MVP.
- Whether e-prescribing, laboratory, pharmacy, PDMP, EHR, or clearinghouse integrations are required.
- Data migration requirements from existing spreadsheets, forms, EHR, or scheduling systems.
- Retention periods, record-release process, proxy access rules, and emergency/crisis messaging approved by counsel.
- Approved Twilio and Resend content, consent language, sender identities, quiet hours, and opt-out rules.

## 22.2 Expansion Backlog

- Spravato workflow and program reporting.
- HBOT resource and course management.
- Peptide therapy protocols and follow-up.
- Telehealth encounters.
- Secure messaging.
- Referral partner portal.
- Patient education library and care-plan adherence tracking.
- Inventory and medication/supply administration tracking.
- Multi-practice or multi-tenant architecture.
- Native mobile application if portal usage justifies it.

# Appendix A — Suggested Status Enumerations

| **Domain**           | **Suggested Values**                                                                   |
| -------------------- | -------------------------------------------------------------------------------------- |
| **Appointment**      | requested, scheduled, confirmed, checked_in, in_progress, completed, canceled, no_show |
| **Form submission**  | not_started, in_progress, submitted, reviewed, rejected, superseded                    |
| **Encounter**        | draft, signed, amended, locked                                                         |
| **Task**             | open, in_progress, blocked, completed, canceled                                        |
| **Communication**    | queued, sent, delivered, failed, bounced, opted_out                                    |
| **Patient**          | lead, invited, active, inactive, discharged, deceased, archived                        |
| **Treatment series** | planned, approved, active, paused, completed, discontinued                             |

# Appendix B — Definition of Done

- Acceptance criteria implemented and demonstrated.
- Authorization enforced and tested server-side.
- Validation and error states implemented.
- Audit events added for sensitive actions.
- Responsive and keyboard-accessible UI verified.
- Loading, empty, success, and failure states implemented.
- Automated tests added at the appropriate level.
- No secrets or sensitive data exposed in logs, URLs, or client code.
- Operational documentation and release notes updated.
- Product owner and clinical/compliance reviewers approve the workflow where required.
