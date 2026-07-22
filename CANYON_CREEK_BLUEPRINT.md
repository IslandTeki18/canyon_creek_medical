# Implementation Blueprint

## Integrative Mental Health, Addiction Medicine & Holistic Care Practice

Detailed build sequence, iterative delivery plan, and right-sized engineering tasks

| **Target Stack**         | React, TypeScript, Tailwind CSS, shadcn/ui, Convex, Clerk, Twilio, Resend |
| ------------------------ | ------------------------------------------------------------------------- |
| **Delivery Model**       | Deployable vertical slices with automated verification                    |
| **Source Specification** | Product Requirements & Technical Specification v1.0                       |
| **Blueprint Version**    | 1.0 — July 2026                                                           |

**Clinical and compliance boundary:** This blueprint covers software
delivery. Production clinical protocols, controlled-substance workflows, consent language, privacy requirements, vendor agreements, and regulatory interpretations require approval by qualified clinical, legal, security, and compliance professionals.

# 1. How to Use This Blueprint

This plan is intentionally dependency-ordered. Work should proceed in sequence unless a task is explicitly marked as parallel-safe. Each increment produces a demonstrable, deployable outcome and closes with verification before the next increment begins.

- **Blueprint level:** The complete path from project initialization
  through production readiness.

- **Increment level:** A vertical slice that creates one meaningful
  operational capability.

- **Task level:** A small engineering unit generally suitable for one
  pull request.

- **Verification level:** Observable evidence that the task or increment
  works and has not weakened security or existing behavior.

## 1.1 Right-Sizing Rules

- One task should change one primary behavior or establish one bounded
  technical capability.

- A task should normally touch one feature area and no more than a small
  number of shared modules.

- Every task must end with a test, inspection, demo, or measurable
  artifact.

- Infrastructure-only tasks must immediately support the next
  user-facing slice; avoid long platform-only phases.

- Database schema changes must include indexes, authorization
  implications, migration/backfill handling, and test fixtures.

- External integration tasks must include idempotency, signature
  verification, logging, and failure handling before being considered complete.

- Clinical workflow tasks must implement documentation and operational
  rules without encoding autonomous clinical decisions.

## 1.2 Definition of Done for Every Task

- Acceptance criteria are satisfied.

- TypeScript passes in strict mode with no new unsafe escapes.

- Linting and formatting pass.

- Unit or integration tests cover the new behavior and important denial
  paths.

- Authorization is enforced server-side in Convex, not only in the UI.

- Loading, empty, validation, error, and success states are implemented
  where applicable.

- Audit logging is added for sensitive reads or writes where required.

- No protected health information is exposed in URLs, browser logs,
  analytics, SMS, or email templates.

- The feature is reviewed in a staging environment using synthetic data.

- Documentation and environment-variable examples are updated when
  behavior or configuration changes.

# 2. Delivery Architecture

## 2.1 Recommended Repository Shape

```text
src/
├── app/
├── features/
│   ├── auth/
│   ├── patients/
│   ├── intake/
│   ├── scheduling/
│   ├── encounters/
│   ├── medications/
│   ├── mat/
│   ├── ketamine/
│   ├── communications/
│   └── administration/
├── components/
├── lib/
└── integrations/

convex/
├── schema.ts
├── auth.config.ts
├── domains/
├── integrations/
├── scheduledJobs.ts
└── lib/

tests/
├── unit/
├── integration/
└── e2e/
```

## 2.2 Core Engineering Patterns

- Feature-oriented frontend modules with domain boundaries rather than
  page-oriented dumping grounds.

- Convex domain modules that expose public queries/mutations and keep
  privileged integration logic internal.

- Permission checks expressed as capabilities such as patient.read,
  appointment.manage, encounter.sign, and audit.view.

- Zod schemas shared where practical between forms and backend
  validation, while all Convex functions still validate independently.

- Immutable event and version records for signed notes, consent
  versions, communication attempts, and webhook receipts.

- Adapter interfaces for Clerk, Twilio, Resend, payment provider, future
  EHR, and laboratory integrations.

- Feature flags for service modules not yet clinically or operationally
  approved.

# 3. Final Iterative Breakdown

The original specification was reduced through three levels: broad phases, deployable increments, and pull-request-sized tasks. The final sequence below is the recommended implementation order.

| **Increment** | **Outcome**                                       | **Exit condition**                                                                             |
| ------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Increment 0   | Delivery foundation                               | A running application with repeatable environments, quality gates, and deployment scaffolding. |
| Increment 1   | Identity and workforce authorization              | Secure sign-in, synchronized users, roles, permissions, and protected routes.                  |
| Increment 2   | Patient registry and chart shell                  | Authorized staff can create, locate, and view a patient chart foundation.                      |
| Increment 3   | Patient invitation and self-service profile       | A patient can activate an account and maintain permitted demographic information.              |
| Increment 4   | Configurable forms and intake                     | Administrators publish forms; patients complete versioned intake; staff see readiness.         |
| Increment 5   | Scheduling core                                   | Staff create and manage appointments with provider availability and clear statuses.            |
| Increment 6   | Reminder and communication engine                 | Neutral SMS/email notifications are sent safely, tracked, retried, and surfaced to staff.      |
| Increment 7   | Clinical chart foundations                        | Providers document allergies, medications, diagnoses, plans, encounters, and amendments.       |
| Increment 8   | Mental health measurement                         | Structured evaluations and scored symptom questionnaires support longitudinal care.            |
| Increment 9   | MAT operational workflow                          | The system coordinates MAT documentation, monitoring, follow-up, and staff queues.             |
| Increment 10  | Ketamine operational workflow                     | The system coordinates screening, sessions, monitoring, discharge, and resource readiness.     |
| Increment 11  | Tasks, files, alerts, and after-visit information | Cross-cutting clinical operations become actionable and auditable.                             |
| Increment 12  | Administration and reporting                      | Authorized administrators configure services and monitor operational performance.              |
| Increment 13  | Security hardening and compliance validation      | Access, auditability, data handling, resilience, and operational safeguards are verified.      |
| Increment 14  | Pilot, migration, and production launch           | The system is validated with real workflows and released through controlled rollout.           |

# 4. Increment 0 — Delivery Foundation

**Increment outcome:** A developer can run, test, inspect, and deploy
the same application across local, preview, staging, and production environments.

**Exit gate:** A blank authenticated-ready application deploys successfully;
checks run automatically; environment ownership and secret handling are documented.

### 0.1 — Initialize repository and package standards

**Goal:** Create the smallest stable React and Convex workspace.

1.  Create the React TypeScript application using the selected build
    tool and enable strict TypeScript settings.

2.  Initialize Convex and connect the local development environment.

3.  Install Tailwind CSS and initialize shadcn/ui.

4.  Add package scripts for dev, build, typecheck, lint, test, and
    format.

5.  Commit an example environment file containing names only, never
    secret values.

**Verification:** A new developer can clone the repository, install
dependencies, run one command, and see the application plus a successful Convex connection.

### 0.2 — Create application shell and routing

**Goal:** Establish stable route and layout boundaries before features
accumulate.

6.  Create public, authentication, patient portal, workforce, and
    administration route groups.

7.  Add basic error boundaries, not-found handling, and route-level
    loading states.

8.  Create shared page container, navigation shell, header, and
    accessible skip link.

9.  Add a temporary environment indicator in non-production
    environments.

**Verification:** Each route group renders independently and navigation
does not expose protected content.

### 0.3 — Configure quality gates

**Goal:** Make unsafe changes difficult to merge.

10. Configure ESLint for React, TypeScript, hooks, and import
    boundaries.

11. Configure formatting and pre-commit checks.

12. Add Vitest and React Testing Library.

13. Add Playwright with one application smoke test.

14. Create continuous integration steps for install, typecheck, lint,
    unit tests, build, and smoke test.

**Verification:** A deliberately broken type, lint rule, unit test, and
end-to-end test each fail CI for the correct reason.

### 0.4 — Define environment and deployment model

**Goal:** Prevent secrets and data from crossing environments.

15. Define local, preview, staging, and production environment
    responsibilities.

16. Create separate Convex deployments for staging and production.

17. Document secret ownership and rotation procedures for Clerk, Twilio,
    and Resend.

18. Configure preview deployment without production credentials.

19. Document synthetic-data-only rules outside production.

**Verification:** Staging and production use separate data and
credentials; preview cannot send real messages.

### 0.5 — Create observability baseline

**Goal:** Provide enough evidence to diagnose failures from the
beginning.

20. Create a structured server logging helper that supports request,
    user, entity, and correlation identifiers without PHI payloads.

21. Create a client error boundary that presents a safe reference
    identifier.

22. Define severity levels and production log-retention expectations.

23. Add a health/readiness view for environment and backend connectivity
    without exposing secrets.

**Verification:** A simulated Convex failure creates a traceable,
non-PHI log event and a safe user-facing error state.

# 5. Increment 1 — Identity and Workforce Authorization

**Increment outcome:** Patients and workforce users authenticate through
Clerk, while Convex independently enforces role and permission rules.

**Exit gate:** Unauthorized requests fail server-side; workforce MFA policy
is ready; user lifecycle changes synchronize reliably.

### 1.1 — Integrate Clerk authentication

**Goal:** Establish sign-in and session handling.

**Depends on:** 0.1–0.2

24. Configure Clerk provider and environment variables.

25. Add sign-in, sign-up or invitation acceptance, sign-out, and
    session-expired screens.

26. Protect patient and workforce route groups.

27. Add current-user loading and error handling.

**Verification:** An unauthenticated visitor cannot enter protected
routes; authenticated sessions survive refresh and sign out cleanly.

### 1.2 — Create identity synchronization

**Goal:** Represent Clerk identities in the Convex domain model.

**Depends on:** 1.1

28. Add users table fields for Clerk user ID, status, type, display
    name, contact fields, and timestamps.

29. Create Clerk webhook endpoint with signature verification.

30. Handle user.created, user.updated, and user.deleted or revoked
    events idempotently.

31. Create reconciliation logic for missing or delayed webhook events.

32. Log synchronization failures without logging sensitive payloads.

**Verification:** Replaying the same webhook does not duplicate users;
revocation prevents further application access.

### 1.3 — Implement capabilities and role assignments

**Goal:** Avoid hard-coding authorization decisions around labels alone.

**Depends on:** 1.2

33. Define initial capabilities for patients, front desk, clinical
    staff, provider, administrator, and auditor.

34. Create role and user-role-assignment tables or equivalent
    configuration.

35. Create server helpers requireAuthenticatedUser, requireCapability,
    and requirePatientOwnership.

36. Create frontend PermissionGate and route guards for presentation
    only.

37. Add denial-path tests for each role.

**Verification:** Direct Convex calls fail without the required
capability even when UI controls are manually exposed.

### 1.4 — Build workforce user administration

**Goal:** Allow controlled onboarding and deactivation of staff.

**Depends on:** 1.3

38. Create workforce user list and detail screens.

39. Create invitation flow that assigns an approved role before first
    access.

40. Add active, suspended, and deactivated states.

41. Require reason entry for role changes and deactivation.

42. Write audit events for invitations, role changes, suspension, and
    reactivation.

**Verification:** An administrator can invite and deactivate a test
staff account; the account immediately gains or loses the correct permissions.

### 1.5 — Establish session security controls

**Goal:** Prepare workforce authentication for healthcare operations.

**Depends on:** 1.4

43. Enable Clerk MFA policy for workforce users.

44. Configure session duration and inactivity behavior.

45. Add a session/device review link or documented Clerk-based workflow.

46. Ensure suspended users are denied by Convex even if a stale client
    session remains.

47. Add test instructions for emergency session revocation.

**Verification:** A suspended or revoked account cannot execute Convex
operations with an old browser session.

# 6. Increment 2 — Patient Registry and Chart Shell

**Increment outcome:** Authorized staff can create, search, and open a
patient chart that contains only foundational identity and operational information.

**Exit gate:** Patient records are deduplicated deliberately, scoped by
permission, and auditable.

### 2.1 — Define patient schema and indexes

**Goal:** Create the minimum durable patient identity record.

**Depends on:** 1.3

48. Add patients table with legal name, preferred name, date of birth,
    contact fields, status, external identifiers, and archive fields.

49. Add separate emergency contacts, addresses, communication
    preferences, and pharmacy records.

50. Add normalized search fields and indexes for name, date of birth,
    email, phone, and status.

51. Define which fields patients may edit versus staff-only fields.

52. Create synthetic patient fixtures.

**Verification:** Schema supports fast search patterns and prevents
accidental hard deletion.

### 2.2 — Create staff patient registration

**Goal:** Allow front desk users to establish a chart safely.

**Depends on:** 2.1

53. Build a multi-section patient creation form with server validation.

54. Perform duplicate candidate search before final creation.

55. Require explicit acknowledgement when staff proceeds despite a
    possible duplicate.

56. Create the patient and related communication preference record
    transactionally.

57. Write audit events for patient creation.

**Verification:** Staff can create a patient; duplicate warnings appear;
unauthorized roles cannot create records.

### 2.3 — Build patient search and registry

**Goal:** Give staff a fast operational entry point.

**Depends on:** 2.1

58. Create debounced search across supported indexed fields.

59. Add status filters and stable pagination.

60. Present minimal identifying information sufficient to distinguish
    patients.

61. Add empty, no-result, loading, and error states.

62. Prevent sensitive clinical details from appearing in the search
    list.

**Verification:** Common searches return within the agreed staging
target and do not leak clinical data.

### 2.4 — Build chart shell and summary header

**Goal:** Create a stable destination for future chart modules.

**Depends on:** 2.2–2.3

63. Create patient chart routes and tabs for summary, appointments,
    intake, medications, encounters, documents, tasks, and audit-visible metadata.

64. Implement patient identity header, status, communication preference,
    and alert placeholders.

65. Add archive/reactivate controls behind capability checks.

66. Add safe breadcrumbs that contain no sensitive query parameters.

67. Log chart access if required by the approved audit policy.

**Verification:** Authorized staff can open a chart; patients and
unrelated users cannot access another patient by changing the URL.

# 7. Increment 3 — Patient Invitation and Self-Service Profile

**Increment outcome:** A staff-created patient can activate a portal
account and update specifically permitted profile information.

**Exit gate:** Account linking is deliberate, invitations expire safely, and
ownership checks protect every patient-facing query and mutation.

### 3.1 — Create patient-account link model

**Goal:** Separate clinical patient identity from authentication
identity.

**Depends on:** 2.1, 1.2

68. Add patientAccountLinks with patient ID, user ID, relationship type,
    status, verification method, and timestamps.

69. Enforce one active self relationship per user and patient.

70. Create ownership authorization helpers.

71. Add future-ready relationship types for guardian or proxy without
    enabling them yet.

**Verification:** A user cannot link themselves to a different patient
through client manipulation.

### 3.2 — Implement secure invitation lifecycle

**Goal:** Let staff invite patients without unsafe identity assumptions.

**Depends on:** 3.1

72. Create invitation record with opaque token hash, patient, intended
    contact channel, expiration, status, and inviter.

73. Create staff action to generate a Clerk invitation and application
    record.

74. Create acceptance handler that validates identity and consumes the
    invitation once.

75. Handle expired, revoked, previously consumed, and mismatched
    invitations.

76. Audit invitation creation, revocation, acceptance, and failure.

**Verification:** The same invitation cannot be consumed twice; expired
or revoked invitations provide no account access.

### 3.3 — Build patient portal home

**Goal:** Provide a clear first destination after activation.

**Depends on:** 3.2

77. Create portal home with profile completion, upcoming appointment
    placeholder, intake placeholder, and practice contact information.

78. Add neutral emergency and crisis disclaimer content supplied by the
    practice.

79. Create responsive navigation for profile, appointments, forms,
    documents, and account settings.

80. Ensure all content is scoped through the linked patient ID.

**Verification:** A patient sees only their own portal shell on desktop
and mobile widths.

### 3.4 — Build patient-editable profile

**Goal:** Collect and maintain operational demographics.

**Depends on:** 3.3

81. Create forms for preferred name, phone, email, address, emergency
    contact, communication preferences, and preferred pharmacy.

82. Identify staff-only fields and render them read-only or omit them.

83. Require reauthentication or an approved verification flow for
    high-risk identity changes if policy requires.

84. Create field-level audit events for material changes.

85. Add optimistic or explicit save feedback without exposing data in
    logs.

**Verification:** Patient updates permitted fields; forbidden fields
remain unchanged when a crafted request is sent.

# 8. Increment 4 — Configurable Forms and Intake

**Increment outcome:** Administrators publish versioned intake and
consent templates; patients complete assigned forms; staff see a reliable readiness state.

**Exit gate:** Published versions are immutable, signatures retain context,
scoring is deterministic, and readiness explains every missing requirement.

### 4.1 — Define form template model

**Goal:** Represent configurable forms without executable arbitrary
code.

**Depends on:** 2.1

86. Create formTemplates and formVersions tables.

87. Define supported field types, sections, validation constraints,
    conditional visibility rules, score rules, and completion rules.

88. Define draft, published, retired, and superseded states.

89. Prevent edits to a published version; create a new draft version
    instead.

90. Add JSON/schema validation and safe limits for form complexity.

**Verification:** Invalid form definitions are rejected; published
versions remain unchanged after later edits.

### 4.2 — Build form administration editor

**Goal:** Allow approved administrators to create ordinary operational
forms without deployment.

**Depends on:** 4.1

91. Create template list and version history screens.

92. Create section and field editor using a constrained component set.

93. Add preview using the same renderer used by patients.

94. Add publish confirmation that summarizes changes and affected
    assignments.

95. Audit creation, editing, publishing, retirement, and restoration.

**Verification:** An administrator can publish a simple intake form and
cannot mutate the published version.

### 4.3 — Build patient form renderer

**Goal:** Render forms accessibly and preserve draft progress.

**Depends on:** 4.1

96. Render each supported field using React Hook Form and Zod-derived
    validation.

97. Save drafts explicitly or through bounded autosave with clear
    status.

98. Implement conditional fields and server validation.

99. Handle version mismatch when a template changes before submission.

100.  Create submitted response snapshot containing template/version
      references.

**Verification:** A patient can start, leave, resume, and submit a form;
invalid crafted payloads are rejected by Convex.

### 4.4 — Implement consent and signature records

**Goal:** Capture evidence without treating a typed name as universally
sufficient for every legal use.

**Depends on:** 4.2–4.3

101. Create consent template type and acceptance record.

102. Record exact version, patient, signer identity, relationship,
     timestamp, IP or device metadata only if approved, and signature representation.

103. Present consent content before signature and require explicit
     acknowledgement.

104. Generate a stable human-readable consent receipt.

105. Prevent silent replacement or deletion of accepted consent records.

**Verification:** A consent record can be traced to the exact text shown
and cannot be altered after acceptance.

### 4.5 — Create form assignment engine

**Goal:** Assign the correct intake requirements to patients and
appointments.

**Depends on:** 4.2–4.4

106. Create assignment rules by service, appointment type, new/returning
     status, and effective date.

107. Generate patient form assignments idempotently.

108. Allow authorized manual assignment and waiver with reason.

109. Handle retired templates without breaking historical submissions.

110. Expose assignment state to patient and staff views.

**Verification:** Running assignment twice produces no duplicates;
overrides are reasoned and audited.

### 4.6 — Build readiness calculation

**Goal:** Produce an explainable operational readiness status.

**Depends on:** 4.5, 3.4

111. Define readiness inputs: required profile fields, forms, consents,
     insurance or self-pay data, and later appointment-specific checks.

112. Create server-side readiness query returning status plus
     missing-item reasons.

113. Add readiness badge and checklist to staff chart and patient
     portal.

114. Update readiness reactively when requirements change.

115. Add tests for ready, incomplete, waived, expired, and superseded
     cases.

**Verification:** Staff can identify exactly why a patient is not ready
from one screen; status cannot be overridden accidentally.

# 9. Increment 5 — Scheduling Core

**Increment outcome:** Staff can configure availability, book
appointments, and manage lifecycle statuses without double-booking providers or resources.

**Exit gate:** Appointment creation is conflict-safe, time-zone-safe,
audited, and visible in both workforce and patient views.

### 5.1 — Define scheduling schema

**Goal:** Create durable scheduling concepts before calendar UI work.

**Depends on:** 2.1, 1.3

116. Add locations, providers, services, appointmentTypes,
     availabilityRules, timeOff, resources, appointments, and appointmentEvents.

117. Define appointment lifecycle statuses and allowed transitions.

118. Store canonical timestamps and explicit location time zone.

119. Add indexes by date, provider, patient, location, and status.

120. Define cancellation reason and no-show metadata.

**Verification:** Schema can represent one-time availability, time off,
patient appointments, and future resource reservations.

### 5.2 — Build administrative scheduling configuration

**Goal:** Let authorized users establish bookable rules.

**Depends on:** 5.1

121. Create location and appointment-type management screens.

122. Create provider working-hour and time-off screens.

123. Configure duration, buffer, location, eligible provider, and
     patient self-scheduling flag.

124. Validate overlapping or contradictory configuration.

125. Audit configuration changes.

**Verification:** A provider has a valid weekly schedule and a blocked
time-off interval visible in staging.

### 5.3 — Implement slot generation service

**Goal:** Calculate availability deterministically.

**Depends on:** 5.2

126. Generate candidate slots from availability, duration, buffers, time
     off, existing appointments, and location rules.

127. Keep slot calculation server-side.

128. Handle daylight-saving transitions and location time zones.

129. Add tests for boundaries, overlaps, buffers, and DST dates.

130. Cache only when invalidation behavior is explicit.

**Verification:** The same inputs produce the same slots, and no
generated slot overlaps blocked time or an existing appointment.

### 5.4 — Build staff appointment booking

**Goal:** Create a conflict-safe booking workflow.

**Depends on:** 5.3, 4.5

131. Create patient and appointment-type selection flow.

132. Display server-generated slots.

133. On confirmation, recheck availability inside the mutation before
     inserting.

134. Create the appointment event history and required form assignments.

135. Return a specific conflict result when a slot was taken
     concurrently.

**Verification:** Two simultaneous attempts cannot create overlapping
confirmed appointments.

### 5.5 — Build appointment calendar and daily queue

**Goal:** Support front-desk operations.

**Depends on:** 5.4

136. Create day and week views with provider and location filters.

137. Create compact daily list optimized for readiness, confirmation,
     arrival, and status updates.

138. Add accessible list alternative to visual calendar.

139. Add appointment detail drawer or route with event history.

140. Keep sensitive clinical content out of general calendar cells.

**Verification:** Staff can manage a full synthetic day without opening
each patient chart for basic status information.

### 5.6 — Implement appointment lifecycle actions

**Goal:** Make rescheduling and cancellation explicit and traceable.

**Depends on:** 5.5

141. Implement confirm, check-in, in-progress, complete, no-show,
     cancel, and reschedule transitions.

142. Validate transition rules server-side.

143. Create a new event record for each transition.

144. Recalculate form requirements and reminder jobs after rescheduling.

145. Expose permitted cancellation and reschedule actions to patients
     when configured.

**Verification:** Invalid transitions fail; rescheduling preserves
history and does not duplicate requirements.

### 5.7 — Add waitlist foundation

**Goal:** Capture demand without promising automated matching yet.

**Depends on:** 5.4

146. Create waitlist entries by patient, appointment type, date window,
     location, and provider preference.

147. Create staff list and status management.

148. Add manual conversion from waitlist to appointment using standard
     booking checks.

149. Audit contact attempts and conversion.

**Verification:** A waitlist entry can be converted without bypassing
slot conflict rules.

# 10. Increment 6 — Reminder and Communication Engine

**Increment outcome:** Appointments and incomplete intake generate
neutral, consent-aware SMS and email notifications with complete delivery tracking.

**Exit gate:** Duplicate messages are prevented; callbacks are verified;
failures enter a staff-visible queue; no prohibited clinical details appear in templates.

### 6.1 — Define communication domain model

**Goal:** Separate message intent from vendor delivery attempts.

**Depends on:** 4.6, 5.1

150. Create messageTemplates, communicationPreferences,
     communicationJobs, communicationAttempts, webhookEvents, and suppression records.

151. Define neutral template variables and forbid arbitrary
     patient-chart interpolation.

152. Define job states, attempt states, retry counters, and idempotency
     keys.

153. Add indexes for due jobs, failed attempts, patient history, and
     provider callbacks.

**Verification:** The model supports one logical message with multiple
delivery attempts and callback updates.

### 6.2 — Build template administration

**Goal:** Allow safe wording changes without code deployments.

**Depends on:** 6.1

154. Create SMS and email template editor with approved variable picker.

155. Add preview using synthetic values.

156. Add validation for prohibited or unknown variables.

157. Version published templates and preserve the version used for each
     send.

158. Add approval status if organizational policy requires dual review.

**Verification:** Published templates render with only approved neutral
fields and remain traceable after edits.

### 6.3 — Create Twilio adapter

**Goal:** Send SMS through a narrow, testable integration boundary.

**Depends on:** 6.1

159. Create sendSms adapter and typed result model.

160. Use Twilio credentials only in Convex actions.

161. Add messaging-service or sender configuration.

162. Pass a status callback URL and an application correlation
     identifier.

163. Map vendor errors into transient and permanent categories without
     storing full payloads unnecessarily.

**Verification:** A staging test number receives a neutral SMS and a
failed number produces a normalized error.

### 6.4 — Create Resend adapter

**Goal:** Send transactional email through a narrow integration
boundary.

**Depends on:** 6.1

164. Create sendEmail adapter and typed result model.

165. Configure verified sender identities per environment.

166. Build accessible HTML and plain-text rendering.

167. Keep sensitive data out of subject lines and preview text.

168. Map send errors into normalized categories.

**Verification:** A staging mailbox receives matching HTML and
plain-text content with a safe subject.

### 6.5 — Implement reminder scheduler

**Goal:** Generate due communications exactly once.

**Depends on:** 6.2–6.4, 5.6

169. Define reminder schedules by appointment type and channel.

170. Create scheduled job that materializes communication jobs from
     upcoming appointments and incomplete intake.

171. Generate deterministic idempotency keys from intent, recipient,
     appointment or assignment, channel, and schedule point.

172. Skip cancelled appointments, opted-out channels, and already
     satisfied intake requirements.

173. Recompute or invalidate future jobs after appointment changes.

**Verification:** Repeated scheduler runs produce no duplicate logical
jobs; rescheduling updates future reminders correctly.

### 6.6 — Process outbound jobs and retries

**Goal:** Deliver reliably without endless retry loops.

**Depends on:** 6.5

174. Claim due jobs safely to prevent concurrent duplicate sends.

175. Render the stored template version with approved variables.

176. Create attempt before vendor call and finalize it after response.

177. Retry transient failures with bounded exponential backoff.

178. Move permanent or exhausted failures into a staff follow-up state.

**Verification:** A simulated transient failure retries within limits; a
permanent failure stops and appears in the queue.

### 6.7 — Implement signed webhook callbacks

**Goal:** Update delivery state using verified external events.

**Depends on:** 6.3–6.4

179. Create Twilio callback endpoint and verify Twilio signature.

180. Create Resend webhook endpoint and verify its signature method.

181. Store webhook event identifiers and reject replays idempotently.

182. Map vendor delivery events to normalized attempt states.

183. Log unmatched callbacks for investigation without changing
     unrelated records.

**Verification:** Forged callbacks are rejected; replayed valid
callbacks produce no duplicate state changes.

### 6.8 — Build communication history and failure queue

**Goal:** Give staff operational visibility.

**Depends on:** 6.6–6.7

184. Add patient communication timeline showing channel, intent,
     timestamp, and delivery state without exposing unnecessary message bodies.

185. Create failed-delivery queue with filters and retry/contact
     actions.

186. Add manual resend that creates a new logical attempt with reason.

187. Respect suppression and opt-out state in manual actions.

188. Audit manual resend and preference changes.

**Verification:** Staff can resolve a failed reminder without bypassing
consent or suppression rules.

# 11. Increment 7 — Clinical Chart Foundations

**Increment outcome:** Providers can maintain core clinical lists and
create, sign, and amend encounter notes while preserving history.

**Exit gate:** Signed documentation is immutable, amendments are explicit,
permissions are enforced, and patients see only approved content.

### 7.1 — Implement allergies and medication list

**Goal:** Create structured, longitudinal medication safety information.

**Depends on:** 2.4, 1.3

189. Add allergies and medications tables with status, dates, source,
     author, and patient-reported distinction.

190. Create provider and permitted clinical-staff CRUD workflows.

191. Allow patients to submit reported changes into a review queue
     rather than silently altering clinician-maintained records.

192. Add active/historical views and reconciliation state.

193. Audit material changes.

**Verification:** A patient-reported medication change remains
distinguishable from a provider-confirmed medication record.

### 7.2 — Implement diagnoses and problem list

**Goal:** Track clinician-authored conditions without enabling
autonomous diagnosis.

**Depends on:** 7.1

194. Add diagnoses/problem table with coding system, code, display text,
     status, onset, resolution, author, and encounter source.

195. Create search/select component using an approved code source or
     temporary configured catalog.

196. Restrict add/change/remove actions to appropriate clinical roles.

197. Preserve historical diagnoses and reasons for status change.

**Verification:** Only authorized clinicians can create or change
diagnoses; history remains visible.

### 7.3 — Implement treatment plans

**Goal:** Represent goals and actions across encounters.

**Depends on:** 7.2

198. Add treatmentPlans, planGoals, planActions, and version metadata.

199. Create draft and active states.

200. Allow links to medications, referrals, lifestyle recommendations,
     and follow-up timing.

201. Create patient-visible flags at item level.

202. Preserve prior versions when the plan is revised.

**Verification:** A revised plan retains the prior version and exposes
only approved items in the patient portal.

### 7.4 — Build encounter draft workflow

**Goal:** Create a safe structured note before signing complexity.

**Depends on:** 5.6, 7.1–7.3

203. Add encounters and encounterDrafts with appointment, provider,
     patient, type, status, sections, and timestamps.

204. Create encounter start action from an eligible appointment.

205. Build structured note sections for history, assessment, plan, risk,
     education, and follow-up.

206. Implement explicit save and safe autosave behavior.

207. Prevent concurrent accidental overwrite through version checks.

**Verification:** A provider can create, save, leave, and resume a draft
without another session silently overwriting newer content.

### 7.5 — Implement signing and locking

**Goal:** Turn drafts into immutable clinical records.

**Depends on:** 7.4

208. Validate required sections before signing.

209. Require provider identity and current authorization at sign time.

210. Create immutable signed snapshot and signature metadata.

211. Lock the original content from ordinary mutation.

212. Update appointment completion or documentation status as
     appropriate.

**Verification:** After signing, direct edit requests fail and the exact
signed snapshot remains retrievable.

### 7.6 — Implement amendments

**Goal:** Correct signed documentation without erasing history.

**Depends on:** 7.5

213. Create amendment record linked to signed encounter.

214. Require amendment reason and new author signature.

215. Display original note and amendments in chronological order.

216. Prohibit destructive replacement of the original snapshot.

217. Audit creation and viewing according to policy.

**Verification:** The original note remains unchanged and every
amendment identifies who changed what and why.

### 7.7 — Create patient-visible after-visit summary

**Goal:** Publish only provider-approved information.

**Depends on:** 7.5, 6.4

218. Create after-visit summary draft generated from explicitly selected
     plan elements.

219. Allow provider editing and approval.

220. Publish a versioned patient-visible record.

221. Notify the patient through a neutral portal-availability message.

222. Allow withdrawal or correction through a new version rather than
     silent replacement.

**Verification:** The patient sees only the approved summary, not the
full encounter note.

# 12. Increment 8 — Mental Health Measurement

**Increment outcome:** Providers can complete structured psychiatric
evaluations and review validated questionnaire trends without the software diagnosing or prescribing.

**Exit gate:** Scores are reproducible, source responses remain available,
risk answers trigger human-review workflows, and no score alone performs an autonomous clinical action.

### 8.1 — Create assessment instrument catalog

**Goal:** Represent standardized questionnaires as controlled versions.

**Depends on:** 4.1–4.3

223. Create assessmentDefinitions and assessmentVersions using the form
     engine where compatible.

224. Define question mapping, scoring algorithm, interpretation labels,
     licensing metadata, and effective dates.

225. Add tests using known sample responses and expected scores.

226. Prevent score-rule edits on published versions.

**Verification:** Known response sets produce expected scores for every
enabled instrument.

### 8.2 — Assign and complete assessments

**Goal:** Collect pre-visit and interval measures.

**Depends on:** 8.1, 4.5

227. Allow assignment by appointment type and manual clinical request.

228. Render assessments in the patient portal.

229. Calculate scores server-side on submission.

230. Store raw responses, score, version, and completion context.

231. Handle incomplete high-risk responses according to approved
     workflow.

**Verification:** Patients can complete an assessment; client-supplied
score values are ignored.

### 8.3 — Build score trend view

**Goal:** Provide longitudinal context without overstating meaning.

**Depends on:** 8.2

232. Create patient chart view listing scores over time by instrument.

233. Add accessible data table and simple trend visualization.

234. Label score interpretations as instrument guidance, not diagnosis.

235. Allow providers to open the underlying response set.

236. Exclude assessment details from ordinary notifications.

**Verification:** A provider can trace every plotted score to its exact
responses and instrument version.

### 8.4 — Build initial psychiatric evaluation template

**Goal:** Standardize documentation while preserving clinical judgment.

**Depends on:** 7.4–7.6, 8.3

237. Create structured sections for presenting concern, psychiatric
     history, medical history, family history, medication history, substance use, sleep, lifestyle, trauma, mental status, risk assessment, formulation, and plan.

238. Make optional and required sections configurable by approved
     administrators.

239. Integrate current medications, allergies, diagnoses, and assessment
     scores as references rather than copied mutable text where appropriate.

240. Create provider-only fields and patient-reported provenance labels.

241. Add sign and amendment behavior through the encounter framework.

**Verification:** A provider completes and signs a synthetic initial
evaluation with all required provenance visible.

### 8.5 — Implement clinical review escalations

**Goal:** Route concerning answers to humans without autonomous
emergency handling.

**Depends on:** 8.2

242. Define configurable response rules that create high-priority review
     tasks.

243. Present crisis instructions supplied and approved by the practice
     at the appropriate patient touchpoints.

244. Create staff/provider queue with acknowledgement and disposition
     fields.

245. Ensure the rule never changes diagnosis, medication, or appointment
     automatically.

246. Audit acknowledgement and resolution.

**Verification:** A configured synthetic response creates one urgent
review task and visible patient instructions; duplicate submissions do not create uncontrolled duplicates.

# 13. Increment 9 — MAT Operational Workflow

**Increment outcome:** Authorized staff and providers can coordinate
medication-assisted treatment documentation, monitoring, toxicology records, and follow-up requirements.

**Exit gate:** Clinical decisions remain clinician-controlled; sensitive
substance-use information is permissioned carefully and excluded from ordinary communications.

### 9.1 — Define MAT episode model

**Goal:** Represent a longitudinal treatment episode and operational
states.

**Depends on:** 7.1–7.3, 1.3

247. Create matEpisodes, matAssessments, matMedicationPlans,
     toxicologyRecords, recoveryPlans, and monitoringEvents.

248. Define active, paused, transferred, completed, and archived episode
     states.

249. Create capability set specific to sensitive MAT data if policy
     requires.

250. Add indexes by patient, provider, state, and due follow-up.

**Verification:** Only explicitly authorized roles can read or write MAT
records in server-side tests.

### 9.2 — Build MAT intake and history

**Goal:** Collect structured information with clear provenance.

**Depends on:** 9.1, 4.5

251. Create MAT-specific intake assignment including substance-use
     history, prior treatment, withdrawal history, overdose history, recovery supports, and patient goals.

252. Mark patient-reported versus clinician-verified information.

253. Create provider review status and follow-up questions.

254. Keep sensitive details out of notification templates and general
     work queues.

**Verification:** A MAT intake can be completed and reviewed without
exposing its content outside authorized chart views.

### 9.3 — Build MAT follow-up encounter template

**Goal:** Standardize monitoring documentation.

**Depends on:** 9.2, 7.5

255. Create sections for response, cravings, withdrawal, adherence,
     adverse effects, substance use, counseling coordination, monitoring, risk, plan, and follow-up.

256. Link medication plan and current active episode.

257. Add required-field configuration by appointment type.

258. Use standard signing and amendment mechanisms.

**Verification:** An authorized provider can complete and sign a MAT
follow-up; unauthorized staff can see only permitted operational status.

### 9.4 — Implement toxicology record tracking

**Goal:** Store ordered or received monitoring information without
building a laboratory network.

**Depends on:** 9.1, 11.2 later optional

259. Create manual toxicology record entry with specimen date, type,
     source, status, result attachment or structured summary, reviewer, and review date.

260. Restrict result visibility and editing.

261. Create due/pending/reviewed queue states.

262. Preserve corrections as new versions or amendments.

263. Leave adapter boundary for future lab integration.

**Verification:** A result correction preserves the original entry and
produces a traceable review history.

### 9.5 — Create MAT follow-up queue

**Goal:** Make overdue operational work visible.

**Depends on:** 9.3–9.4, 6.5

264. Calculate next required follow-up from provider-entered plan or
     configured operational rule.

265. Create queue for due appointments, pending monitoring, incomplete
     intake, and unresolved clinical-review tasks.

266. Allow assignment, acknowledgement, and disposition.

267. Use neutral labels outside authorized detail views.

268. Add bounded reminders through the communication engine.

**Verification:** The queue identifies a synthetic overdue episode and
links authorized users to the correct detail.

# 14. Increment 10 — Ketamine Operational Workflow

**Increment outcome:** Authorized staff coordinate ketamine screening,
clearance, session scheduling, monitoring, and discharge documentation with explicit hard stops.

**Exit gate:** Required operational checks are enforced, clinician override
is reasoned and audited where policy permits, and each session has a complete monitoring record.

### 10.1 — Define ketamine treatment course and session model

**Goal:** Separate longitudinal approval from individual treatment
sessions.

**Depends on:** 7.3, 5.1

269. Create ketamineCourses, ketamineClearanceReviews, ketamineSessions,
     sessionVitals, sessionObservations, adverseEvents, and dischargeRecords.

270. Define course and session lifecycle states.

271. Link course to patient, approving clinician, appointment type, and
     treatment plan.

272. Add room/resource requirements and indexes.

**Verification:** Model supports a course with multiple independently
documented sessions and retained history.

### 10.2 — Build screening and clearance workflow

**Goal:** Collect information and require clinician approval.

**Depends on:** 10.1, 4.5

273. Assign ketamine-specific screening and consent forms.

274. Create clinician clearance review with approved, deferred, or
     declined state and rationale.

275. Create required preconditions from approved policy: consent,
     baseline data, escort or transportation, and other configured checks.

276. Keep the system from determining eligibility automatically.

277. Audit all clearance decisions.

**Verification:** No session can reach ready state without a clinician
clearance record and configured prerequisites.

### 10.3 — Add resource-aware session booking

**Goal:** Reserve provider, room, and monitoring capacity.

**Depends on:** 10.2, 5.3–5.4

278. Create ketamine appointment type with required resources.

279. Extend slot generation to include room and monitoring capacity.

280. Recheck all resources at booking mutation time.

281. Display readiness blockers before confirmation.

282. Preserve ordinary appointment event history.

**Verification:** Concurrent bookings cannot reserve the same
constrained room or monitoring resource.

### 10.4 — Build pre-session checklist

**Goal:** Prevent starting an incomplete session.

**Depends on:** 10.3

283. Create checklist items from configurable approved protocol.

284. Capture baseline vitals and staff verifier.

285. Confirm medication details and transportation or escort status
     where required.

286. Calculate operational ready/not-ready state with reasons.

287. Allow only policy-approved override roles and require a reason.

**Verification:** Start action fails when a required item is incomplete;
permitted override generates a high-priority audit event.

### 10.5 — Build session monitoring workspace

**Goal:** Capture time-based observations clearly.

**Depends on:** 10.4

288. Create session start action and lock course/session identity.

289. Add repeated vital-sign entry with timestamps and recorder
     identity.

290. Add medication administration fields, observations, and
     adverse-event action.

291. Display elapsed session time and required observation checkpoints
     without relying solely on client timers.

292. Handle connection interruption with draft recovery.

**Verification:** A complete synthetic session timeline can be
reconstructed from stored records after browser refresh.

### 10.6 — Build discharge and completion workflow

**Goal:** Require documented recovery before final completion.

**Depends on:** 10.5, 7.7

293. Create discharge criteria checklist from approved protocol.

294. Capture final vitals, recovery assessment, escort confirmation,
     instructions, and discharging clinician.

295. Block completion until required criteria are met or permitted
     override is documented.

296. Publish approved patient instructions through the portal.

297. Create follow-up appointment or task according to provider plan.

**Verification:** The session cannot be marked complete without a valid
discharge record.

### 10.7 — Build ketamine operations board

**Goal:** Give staff a safe daily readiness view.

**Depends on:** 10.6

298. Create day board showing scheduled sessions, room/resource,
     readiness, arrival, active monitoring, recovery, and completion.

299. Use minimal operational labels and no unnecessary diagnoses.

300. Highlight missing prerequisites and resource conflicts.

301. Allow navigation to authorized detail screens.

302. Add print/export only if approved and protected.

**Verification:** Staff can coordinate a synthetic treatment day from
one board without seeing unrelated clinical detail.

# 15. Increment 11 — Tasks, Files, Alerts, and After-Visit Operations

**Increment outcome:** Work that spans patients, appointments, records,
and integrations is assignable, trackable, and visible to the correct users.

**Exit gate:** Files are access-controlled and validated; alerts are
explicit; tasks are not used as a substitute for clinical records.

### 11.1 — Create task and work-queue engine

**Goal:** Provide a common operational action model.

**Depends on:** 1.3, 2.4

303. Create taskTypes, tasks, taskEvents, queues, assignments, priority,
     due date, and entity links.

304. Define open, in-progress, blocked, completed, and cancelled
     transitions.

305. Create permission rules by queue and linked patient.

306. Build personal, team, and patient task views.

307. Audit assignment, priority, completion, and cancellation.

**Verification:** A task linked to a patient is visible only to users
allowed to access both the queue and patient.

### 11.2 — Implement secure document uploads

**Goal:** Store patient documents with controlled metadata and delivery.

**Depends on:** 2.4

308. Create documents and documentVersions with type, source, author,
     visibility, review status, storage reference, and timestamps.

309. Validate extension, MIME type, size, and allowed categories before
     upload completion.

310. Define malware-scanning strategy and quarantine state before
     production.

311. Create short-lived authorized download flow.

312. Prevent public or guessable file URLs.

**Verification:** An unauthorized user cannot download a file even with
its storage identifier; rejected types never become available.

### 11.3 — Build document review workflow

**Goal:** Turn uploads into traceable work.

**Depends on:** 11.1–11.2, 6.5

313. Allow patient uploads into pending-review state.

314. Create staff review queue with accept, recategorize, request
     replacement, and restricted actions.

315. Notify the patient neutrally when a document is available or needs
     attention.

316. Preserve replaced versions and review history.

317. Link reviewed records to encounters or monitoring records without
     duplicating files.

**Verification:** A patient upload remains unavailable to broader
clinical use until reviewed according to policy.

### 11.4 — Implement clinical alerts

**Goal:** Surface high-value chart warnings deliberately.

**Depends on:** 2.4, 1.3

318. Create alert types, severity, effective dates, author, reason,
     visibility scope, and acknowledgement state.

319. Create provider/staff alert management behind permissions.

320. Display active alerts in the chart header without exposing them in
     general search or notifications.

321. Archive rather than delete expired alerts.

322. Audit creation, change, acknowledgement, and archive.

**Verification:** Active alerts appear only in authorized chart contexts
and retain complete history.

### 11.5 — Unify patient timeline

**Goal:** Provide a safe chronological operational and clinical index.

**Depends on:** 6.8, 7.6, 11.1–11.4

323. Create timeline query that combines appointments, forms,
     encounters, medication changes, documents, communications, and tasks based on viewer permissions.

324. Return summaries and deep links rather than duplicating full
     records.

325. Add type filters and pagination.

326. Ensure denied event types are omitted server-side.

327. Test patient versus provider timeline differences.

**Verification:** The same patient produces permission-appropriate
timelines for a patient, front-desk user, and provider.

# 16. Increment 12 — Administration and Reporting

**Increment outcome:** Administrators can configure services and monitor
operational performance without direct database intervention.

**Exit gate:** Configuration changes are versioned or audited, reports
exclude unnecessary PHI, and exported data is permission-controlled.

### 12.1 — Build service and appointment-type administration

**Goal:** Consolidate operational configuration into a controlled
workspace.

**Depends on:** 4.5, 5.2, 6.2

328. Create service catalog with active/future/disabled states.

329. Link appointment types, forms, reminders, resources, and permitted
     providers.

330. Add effective dates and validation for dependent configuration.

331. Prevent disabling configuration that would corrupt active
     appointments; require a migration choice.

332. Audit all changes.

**Verification:** An administrator can add an appointment type using
existing modules without a code change.

### 12.2 — Build feature-flag administration

**Goal:** Keep unapproved future services inaccessible.

**Depends on:** 1.3

333. Create server-owned feature flag definitions and environment
     defaults.

334. Add flags for Spravato, HBOT, peptides, secure messaging, billing,
     and integrations.

335. Require both enabled flag and capability for backend operations.

336. Create audit events for flag changes.

337. Disallow production enablement of regulated modules without an
     approval record field or deployment checklist.

**Verification:** Changing a client value cannot enable a disabled
backend feature.

### 12.3 — Create operational dashboard

**Goal:** Provide a focused daily management summary.

**Depends on:** 5.5, 6.8, 11.1

338. Add counts for appointments, readiness, unconfirmed patients,
     incomplete intake, failed communications, unresolved tasks, pending documents, and no-shows.

339. Allow date, location, and provider filters.

340. Link each metric to its operational queue.

341. Use aggregate queries and avoid loading full patient records.

342. Define freshness and loading behavior.

**Verification:** Dashboard totals reconcile with underlying synthetic
queue records.

### 12.4 — Create outcome and utilization reports

**Goal:** Support service improvement without claiming clinical
causation.

**Depends on:** 8.3, 12.3

343. Create appointment completion/no-show trends, intake completion,
     reminder delivery, assessment completion, and service utilization.

344. Create role-restricted exports with date and service filters.

345. De-identify or aggregate where detailed patient data is
     unnecessary.

346. Add export audit event with reason and scope.

347. Apply row and date limits to protect system performance.

**Verification:** An authorized export matches selected scope and
creates an audit record; unauthorized export fails server-side.

### 12.5 — Build audit review interface

**Goal:** Make sensitive activity reviewable.

**Depends on:** All prior increments

348. Create audit event schema/query if not already complete, including
     actor, action, entity, timestamp, reason, correlation ID, and safe metadata.

349. Create filters for user, patient, action, date, severity, and
     integration.

350. Restrict access to auditor/administrator capabilities.

351. Prevent audit records from ordinary editing or deletion.

352. Add high-priority views for break-glass, export, role change, and
     failed signature validation.

**Verification:** An auditor can reconstruct a synthetic record change
and export sequence without access to unrelated clinical content.

# 17. Increment 13 — Security Hardening and Compliance Validation

**Increment outcome:** The application has defensible authorization,
auditability, privacy controls, integration safeguards, and recovery procedures before pilot use.

**Exit gate:** Independent review findings are resolved or formally
accepted; critical denial-path and recovery tests pass.

### 13.1 — Complete authorization matrix tests

**Goal:** Prove every capability boundary rather than relying on spot
checks.

**Depends on:** All feature increments

353. Enumerate each public Convex query, mutation, and action.

354. Map required authentication, capability, ownership, location, and
     care-team scope.

355. Write automated allow and deny tests for each function category.

356. Test archived, suspended, revoked, and stale-session cases.

357. Remove or internalize any function that does not need public client
     access.

**Verification:** The authorization test matrix covers every public
server function and has no unexplained gaps.

### 13.2 — Complete data exposure review

**Goal:** Remove accidental PHI leakage paths.

**Depends on:** 13.1

358. Review routes, query strings, browser storage, client logs, server
     logs, analytics, error reporting, email subjects, and SMS bodies.

359. Inspect frontend network payloads for over-fetching.

360. Reduce list and dashboard responses to required fields.

361. Review generated exports and filenames.

362. Add regression tests for previously identified leaks.

**Verification:** A documented review finds no known PHI in prohibited
channels or unnecessary response fields.

### 13.3 — Harden integrations and webhooks

**Goal:** Validate all trust boundaries.

**Depends on:** 6.7, 1.2

363. Confirm Clerk, Twilio, and Resend signature verification against
     official test cases.

364. Enforce timestamp or replay controls where available.

365. Confirm idempotency under concurrent duplicate delivery.

366. Rate-limit or otherwise bound public endpoints.

367. Rotate staging secrets after testing and document production
     rotation.

**Verification:** Forged, stale, duplicated, malformed, and oversized
webhook requests are handled safely.

### 13.4 — Validate file and export security

**Goal:** Prevent indirect data disclosure.

**Depends on:** 11.2, 12.4

368. Test upload validation bypass attempts.

369. Confirm quarantine and malware-scanning process before production.

370. Test authorization at download time, not only link creation time.

371. Confirm export scope, expiration, storage, and audit behavior.

372. Document retention and deletion behavior for generated files.

**Verification:** A copied link cannot be used after expiration or by a
different unauthorized user.

### 13.5 — Establish backup, recovery, and incident procedures

**Goal:** Make operational failure survivable.

**Depends on:** 0.4–0.5

373. Document Convex backup/export and restore capabilities approved for
     the deployment.

374. Define recovery objectives with practice leadership.

375. Run a staging recovery exercise using synthetic data.

376. Document incident triage, credential rotation, user revocation,
     evidence preservation, and notification ownership.

377. Create downtime workflow for appointments and patient
     communications.

**Verification:** A tabletop exercise demonstrates who does what during
data, credential, messaging, and availability incidents.

### 13.6 — Run accessibility and usability validation

**Goal:** Prevent operational errors caused by interface barriers.

**Depends on:** All frontend increments

378. Run automated accessibility checks across core routes.

379. Complete keyboard-only flows for registration, booking, intake,
     encounter, and session monitoring.

380. Validate screen-reader names, error summaries, focus management,
     contrast, and responsive behavior.

381. Conduct staff usability walkthroughs using realistic synthetic
     scenarios.

382. Fix high-severity findings before pilot.

**Verification:** Core workflows complete without a mouse and without
unresolved critical accessibility defects.

### 13.7 — Complete formal readiness reviews

**Goal:** Create a traceable launch decision.

**Depends on:** 13.1–13.6

383. Complete clinical workflow review with designated clinical owner.

384. Complete privacy and security review.

385. Confirm vendor agreements and production configurations, including
     required healthcare contractual terms.

386. Confirm state-specific and substance-use-record requirements with
     qualified counsel.

387. Record approved exceptions, owners, due dates, and launch blockers.

**Verification:** Production launch has written approval or documented
block status from each required owner.

# 18. Increment 14 — Pilot, Migration, and Production Launch

**Increment outcome:** The practice adopts the system through a
controlled pilot, measured cutover, and reversible production release.

**Exit gate:** Pilot workflows succeed, staff are trained, data quality is
verified, rollback criteria are defined, and launch monitoring is active.

### 14.1 — Define pilot scope and synthetic rehearsal

**Goal:** Limit initial operational risk.

**Depends on:** 13.7

388. Select a small set of staff, providers, appointment types, and
     non-emergency workflows.

389. Define excluded services and fallback procedures.

390. Run end-to-end synthetic scenarios from inquiry through follow-up.

391. Record defects, workflow gaps, and training needs.

392. Require pilot entry criteria before real patient use.

**Verification:** Every pilot scenario has an owner, expected result,
and verified fallback procedure.

### 14.2 — Prepare data migration and initial configuration

**Goal:** Move only required clean data.

**Depends on:** 14.1

393. Inventory source systems and fields.

394. Define patient matching, required fields, archive strategy, and
     data exclusions.

395. Create import scripts with validation reports and idempotent rerun
     behavior.

396. Load practice locations, users, services, appointment types, forms,
     templates, and schedules.

397. Run migration rehearsal and reconcile counts with source owners.

**Verification:** A rehearsal import can be rerun without duplication
and produces a signed reconciliation report.

### 14.3 — Train workforce users

**Goal:** Align permissions and workflows with real responsibilities.

**Depends on:** 14.1

398. Create role-based training guides for front desk, clinical staff,
     providers, administrators, and auditors.

399. Train on normal workflows, error recovery, privacy boundaries, and
     downtime procedures.

400. Use sandbox accounts and synthetic patient cases.

401. Collect sign-off or competency confirmation according to practice
     policy.

402. Update product labels and help content based on confusion patterns.

**Verification:** Each pilot user completes their core scenario and
knows the approved fallback path.

### 14.4 — Run controlled pilot

**Goal:** Use real workflows with heightened observation.

**Depends on:** 14.2–14.3

403. Enable only pilot users and services.

404. Hold daily defect and operations review during pilot.

405. Monitor sign-in failures, readiness issues, booking conflicts,
     message failures, incomplete notes, and support requests.

406. Apply hotfixes only through normal review and deployment controls.

407. Collect structured feedback from patients and staff without placing
     PHI in feedback tools.

**Verification:** Pilot exit metrics and blocker thresholds are met or
explicitly accepted by launch owners.

### 14.5 — Execute production cutover

**Goal:** Release through a reversible sequence.

**Depends on:** 14.4

408. Freeze configuration and migration sources for the agreed cutover
     window.

409. Run final migration/import and reconciliation.

410. Validate production Clerk, Convex, Twilio, Resend, domains, sender
     identities, and callback endpoints.

411. Enable staff first, then selected patient flows, then remaining
     approved services.

412. Keep rollback and downtime procedures immediately available.

**Verification:** Production smoke tests pass for authentication,
patient lookup, booking, form completion, reminder send, encounter signing, and audit lookup.

### 14.6 — Run post-launch stabilization

**Goal:** Close the launch without normalizing defects.

**Depends on:** 14.5

413. Monitor critical metrics and queues daily during stabilization.

414. Triage issues by patient safety, privacy, data integrity,
     operational blockage, and inconvenience.

415. Publish small fixes through tested releases.

416. Compare actual workflows to expected process and update
     training/configuration.

417. Create post-launch review and prioritized next-phase backlog.

**Verification:** No unresolved critical launch defects remain;
operational ownership transitions from launch team to normal support.

# 19. Cross-Cutting Test Strategy

- **Unit tests:** Scoring, validation, state transitions, permission
  predicates, slot calculations, readiness calculations, template rendering, retry classification, and idempotency key generation.

- **Convex integration tests:** Authorization, ownership, indexes,
  mutation invariants, webhook replay handling, scheduled-job behavior, signing/locking, and concurrent booking.

- **Component tests:** Forms, permissions, errors, loading, field
  visibility, conditional rules, and accessibility semantics.

- **End-to-end tests:** Staff-created patient through invitation; intake
  through readiness; booking through reminder; encounter through signed summary; MAT follow-up; ketamine session through discharge.

- **Security tests:** Direct API invocation, ID manipulation, stale
  sessions, role changes, webhook forgery, file access, export scope, and PHI leakage review.

- **Operational tests:** Failed delivery recovery, provider
  cancellation, rescheduling, incomplete intake, duplicate patient warning, offline/interrupted drafts, and downtime procedures.

## 19.1 Minimum End-to-End Scenarios Before MVP Launch

1.  Administrator invites a front-desk user and assigns the correct
    role.

2.  Front desk creates a patient, reviews duplicate candidates, and
    sends an invitation.

3.  Patient activates the account, completes profile, intake,
    assessment, and consent.

4.  Staff books an appointment and sees readiness status change
    reactively.

5.  The system sends confirmation and reminders; delivery callbacks
    update the record.

6.  Provider starts, saves, signs, and amends an encounter.

7.  Patient sees only the approved after-visit summary.

8.  Authorized staff records a MAT follow-up and pending monitoring
    task.

9.  Ketamine staff enforce pre-session prerequisites, record monitoring,
    and complete discharge.

10. Auditor reconstructs the sequence using audit records without
    obtaining excess clinical access.

# 20. Pull Request and Release Rules

- Prefer one final task from this blueprint per pull request. Split
  further when the diff mixes schema, broad UI, integration, and migration concerns without a single testable outcome.

- Every pull request states user-visible outcome, schema impact,
  authorization impact, audit impact, communication impact, test evidence, and rollback strategy.

- Feature flags protect incomplete or unapproved service modules but are
  not substitutes for authorization.

- Schema changes land with compatible readers before writers when a
  multi-deploy transition is needed.

- External messages remain disabled or redirected in preview and
  automated-test environments.

- No production data is copied into development or test environments.

- Releases must include a staging smoke test and a production
  verification checklist.

# 21. Backlog Triage Rules

- **Critical:** Patient safety risk, unauthorized disclosure, corrupted
  clinical record, inability to revoke access, incorrect appointment/resource conflict, or failure to preserve signed documentation.

- **High:** Core workflow blocked without acceptable fallback, repeated
  message duplication, inability to complete intake or encounters, or inaccessible essential functionality.

- **Medium:** Operational inefficiency with a reliable workaround,
  reporting mismatch, noncritical configuration limitation, or isolated usability defect.

- **Low:** Visual polish, convenience improvement, or future
  optimization that does not affect safety, privacy, integrity, or core operations.

# 22. Features Deliberately Deferred

- Patient self-scheduling until staff booking, availability, conflict
  prevention, and reminder invalidation are stable.

- Secure patient-provider messaging until tasks, permissions,
  notification delivery, retention, and escalation policies are mature.

- Billing and payment processing until a compliant processor and
  concrete business rules are selected.

- E-prescribing and controlled-substance integrations until an approved
  vendor and regulatory workflow are selected.

- Spravato until certification, REMS workflow requirements, and clinical
  operations are approved and revalidated against current requirements.

- HBOT and peptide modules until equipment, protocols, consents, service
  ownership, and evidence-based policies are approved.

- Multi-location complexity until one-location scheduling and
  authorization are stable, while preserving location fields in the foundation.

# 23. Final Right-Sizing Review

The plan is considered correctly sized because each task produces one bounded capability, states its dependencies, and ends with observable verification. No increment requires months of invisible infrastructure before users can evaluate behavior. Security, authorization, audit, and failure handling are embedded in each slice rather than postponed to the end.

- Foundation tasks are limited to capabilities immediately consumed by
  the next increment.

- Authentication is separated from authorization, and authorization is
  implemented before patient records.

- Patient identity is separated from account linking, reducing unsafe
  assumptions during invitation workflows.

- Forms precede scheduling readiness; scheduling precedes reminders;
  reminders precede service-specific automation.

- Generic clinical record foundations precede MAT and ketamine
  specialization.

- Every external integration is split into model, adapter, scheduler,
  processor, callback, and operations visibility tasks.

- Every immutable record type has explicit creation, signing/versioning,
  viewing, and correction behavior.

- Pilot and launch work is separated from feature completion so
  operational readiness receives equal weight.
