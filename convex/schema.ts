import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { appointmentStatusValidator } from "./lib/scheduling";

export const roleValidator = v.union(
  v.literal("patient"),
  v.literal("frontDesk"),
  v.literal("clinicalStaff"),
  v.literal("provider"),
  v.literal("administrator"),
  v.literal("auditor"),
);

// Tables land per blueprint increment.
export default defineSchema({
  // One row per Clerk identity. Rows are soft-deactivated, never deleted.
  users: defineTable({
    clerkUserId: v.string(),
    type: v.union(v.literal("patient"), v.literal("workforce")),
    status: v.union(
      v.literal("active"),
      v.literal("suspended"),
      v.literal("deactivated"),
    ),
    // Role assignments; capabilities derive from these in lib/permissions.
    roles: v.array(roleValidator),
    displayName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_clerk_user_id", ["clerkUserId"]),

  // Staff invitation intents. Roles are assigned here, before first access;
  // the Clerk user.created webhook applies them on acceptance.
  workforceInvitations: defineTable({
    email: v.string(),
    roles: v.array(roleValidator),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("revoked"),
    ),
    invitedByUserId: v.id("users"),
    clerkInvitationId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_email", ["email"]),

  // Append-only audit trail for sensitive actions. Never edited or deleted.
  auditEvents: defineTable({
    actorUserId: v.optional(v.id("users")),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_entity", ["entityType", "entityId"])
    .index("by_actor", ["actorUserId"]),

  // Durable patient identity record. Archived (soft) — never hard-deleted.
  // Patient-editable vs staff-only fields are defined in lib/patients.ts.
  patients: defineTable({
    legalFirstName: v.string(),
    legalLastName: v.string(),
    preferredName: v.optional(v.string()),
    dateOfBirth: v.string(), // ISO YYYY-MM-DD
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("archived")),
    externalIds: v.optional(
      v.array(v.object({ system: v.string(), value: v.string() })),
    ),
    archivedAt: v.optional(v.number()),
    archiveReason: v.optional(v.string()),
    // Normalized (lowercased/digits-only) fields kept by lib/patients.ts.
    normalizedLastName: v.string(),
    normalizedEmail: v.optional(v.string()),
    normalizedPhone: v.optional(v.string()),
    searchText: v.string(), // "first preferred last dob" lowercased
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_last_name", ["normalizedLastName", "dateOfBirth"])
    .index("by_dob", ["dateOfBirth"])
    .index("by_email", ["normalizedEmail"])
    .index("by_phone", ["normalizedPhone"])
    .searchIndex("search", {
      searchField: "searchText",
      filterFields: ["status"],
    }),

  emergencyContacts: defineTable({
    patientId: v.id("patients"),
    name: v.string(),
    relationship: v.string(),
    phone: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_patient", ["patientId"]),

  patientAddresses: defineTable({
    patientId: v.id("patients"),
    line1: v.string(),
    line2: v.optional(v.string()),
    city: v.string(),
    state: v.string(),
    postalCode: v.string(),
    use: v.union(v.literal("home"), v.literal("mailing")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_patient", ["patientId"]),

  communicationPreferences: defineTable({
    patientId: v.id("patients"),
    smsOptIn: v.boolean(),
    emailOptIn: v.boolean(),
    voiceOptIn: v.boolean(),
    preferredChannel: v.union(
      v.literal("sms"),
      v.literal("email"),
      v.literal("voice"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_patient", ["patientId"]),

  // --- Communications (Increment 6) ----------------------------------
  messageTemplates: defineTable({
    name: v.string(),
    intent: v.string(),
    channel: v.union(v.literal("sms"), v.literal("email")),
    status: v.union(v.literal("active"), v.literal("retired")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status", ["status"]),

  // Published versions are immutable and jobs pin the exact version sent.
  messageTemplateVersions: defineTable({
    templateId: v.id("messageTemplates"),
    version: v.number(),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("superseded"),
    ),
    subject: v.optional(v.string()),
    body: v.string(),
    publishedAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_template", ["templateId", "version"])
    .index("by_template_status", ["templateId", "status"]),

  reminderSchedules: defineTable({
    appointmentTypeId: v.id("appointmentTypes"),
    templateId: v.id("messageTemplates"),
    channel: v.union(v.literal("sms"), v.literal("email")),
    intent: v.union(
      v.literal("appointmentReminder"),
      v.literal("incompleteIntake"),
    ),
    minutesBefore: v.number(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_appointment_type", ["appointmentTypeId", "active"]),

  communicationJobs: defineTable({
    patientId: v.id("patients"),
    appointmentId: v.optional(v.id("appointments")),
    templateVersionId: v.id("messageTemplateVersions"),
    intent: v.string(),
    channel: v.union(v.literal("sms"), v.literal("email")),
    destination: v.string(),
    scheduledAt: v.number(),
    idempotencyKey: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("failed"),
      v.literal("followUp"),
      v.literal("resolved"),
      v.literal("cancelled"),
    ),
    retryCount: v.number(),
    nextAttemptAt: v.number(),
    claimedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_due", ["status", "nextAttemptAt"])
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_patient", ["patientId", "createdAt"])
    .index("by_appointment", ["appointmentId", "status"]),

  communicationAttempts: defineTable({
    jobId: v.id("communicationJobs"),
    attemptNumber: v.number(),
    provider: v.union(v.literal("twilio"), v.literal("resend")),
    providerMessageId: v.optional(v.string()),
    state: v.union(
      v.literal("created"),
      v.literal("accepted"),
      v.literal("delivered"),
      v.literal("failed"),
    ),
    errorCategory: v.optional(
      v.union(v.literal("transient"), v.literal("permanent")),
    ),
    errorCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_job", ["jobId", "attemptNumber"])
    .index("by_state", ["state", "updatedAt"])
    .index("by_provider_message", ["providerMessageId"]),

  webhookEvents: defineTable({
    provider: v.union(v.literal("twilio"), v.literal("resend")),
    providerEventId: v.string(),
    matched: v.boolean(),
    createdAt: v.number(),
  }).index("by_provider_event", ["provider", "providerEventId"]),

  communicationSuppressions: defineTable({
    patientId: v.id("patients"),
    channel: v.union(v.literal("sms"), v.literal("email")),
    reason: v.string(),
    active: v.boolean(),
    createdByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_patient_channel", ["patientId", "channel", "active"]),

  // Configurable form templates (intake, consent). A template is an identity;
  // content lives in immutable formVersions. Definitions are validated by
  // convex/lib/forms.ts (zod) at every write — never executable code.
  formTemplates: defineTable({
    name: v.string(),
    type: v.union(v.literal("intake"), v.literal("consent")),
    status: v.union(v.literal("active"), v.literal("retired")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status", ["status"]),

  // One row per template version. Published/superseded/retired rows are
  // immutable; only drafts may be edited. Version numbers increase per template.
  formVersions: defineTable({
    templateId: v.id("formTemplates"),
    version: v.number(),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("superseded"),
      v.literal("retired"),
    ),
    definition: v.any(), // FormDefinition, zod-validated on write
    publishedAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_template", ["templateId", "version"])
    .index("by_template_status", ["templateId", "status"]),

  // Patient form responses. Pinned to the exact formVersion shown; submitted
  // responses are immutable snapshots (answers + server-computed score).
  formResponses: defineTable({
    patientId: v.id("patients"),
    templateId: v.id("formTemplates"),
    versionId: v.id("formVersions"),
    status: v.union(v.literal("draft"), v.literal("submitted")),
    answers: v.any(), // Answers, validated by lib/forms on every write
    score: v.optional(v.number()),
    submittedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_patient", ["patientId", "status"])
    .index("by_patient_template", ["patientId", "templateId"]),

  // Accepted consents. Insert-only: no public mutation updates or deletes a
  // consent record, and the referenced formVersion is itself immutable, so
  // every acceptance traces to the exact text shown at signing.
  consentRecords: defineTable({
    patientId: v.id("patients"),
    templateId: v.id("formTemplates"),
    versionId: v.id("formVersions"),
    signerUserId: v.id("users"),
    relationship: v.literal("self"), // guardian/proxy arrive with 3.1 types
    signatureName: v.string(), // typed-name representation
    acknowledged: v.literal(true),
    signedAt: v.number(),
  })
    .index("by_patient", ["patientId"])
    .index("by_patient_version", ["patientId", "versionId"]),

  // Assignment rules: which templates apply to which patients. Service and
  // appointment-type scoping activate when scheduling lands (Increment 5);
  // the fields exist now so rules created today survive that transition.
  formAssignmentRules: defineTable({
    templateId: v.id("formTemplates"),
    audience: v.union(
      v.literal("all"),
      v.literal("new"),
      v.literal("returning"),
    ),
    serviceKey: v.optional(v.string()),
    appointmentType: v.optional(v.string()),
    effectiveAt: v.number(),
    active: v.boolean(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_active", ["active"]),

  // One assignment per patient+template. "Completed" is derived at read time
  // from formResponses/consentRecords, so submissions never need a sync step.
  formAssignments: defineTable({
    patientId: v.id("patients"),
    templateId: v.id("formTemplates"),
    ruleId: v.optional(v.id("formAssignmentRules")),
    source: v.union(v.literal("rule"), v.literal("manual")),
    status: v.union(v.literal("pending"), v.literal("waived")),
    waiveReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_patient", ["patientId"])
    .index("by_patient_template", ["patientId", "templateId"]),

  // Patient portal invitations. Only the SHA-256 hash of the opaque token is
  // stored; the raw token exists only in the activation link. Consumed once.
  patientInvitations: defineTable({
    patientId: v.id("patients"),
    tokenHash: v.string(),
    email: v.string(), // intended contact for identity matching at acceptance
    channel: v.literal("email"),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("revoked"),
    ),
    expiresAt: v.number(),
    invitedByUserId: v.id("users"),
    consumedByUserId: v.optional(v.id("users")),
    clerkInvitationId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_patient", ["patientId"]),

  // Links an authentication identity (users) to a clinical patient record.
  // Created only by the invitation flow — never by client self-linking.
  // guardian/proxy are future-ready types; only "self" is enabled today.
  patientAccountLinks: defineTable({
    patientId: v.id("patients"),
    userId: v.id("users"),
    relationshipType: v.union(
      v.literal("self"),
      v.literal("guardian"),
      v.literal("proxy"),
    ),
    status: v.union(v.literal("active"), v.literal("revoked")),
    verificationMethod: v.string(), // e.g. "invitation"
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId", "status"])
    .index("by_patient", ["patientId", "status"]),

  // --- Scheduling (Increment 5) ---------------------------------------
  // Canonical instants are UTC epoch milliseconds. Wall-clock configuration
  // (working hours) is stored as local minutes-from-midnight plus the
  // location's IANA time zone, so schedules survive DST transitions.

  locations: defineTable({
    name: v.string(),
    timeZone: v.string(), // IANA, e.g. "America/Denver"
    status: v.union(v.literal("active"), v.literal("archived")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status", ["status"]),

  // A bookable clinician. Separate from users: not every provider-role user
  // is schedulable, and scheduling config does not belong on the identity row.
  providers: defineTable({
    userId: v.id("users"),
    displayName: v.string(),
    defaultLocationId: v.optional(v.id("locations")),
    status: v.union(v.literal("active"), v.literal("archived")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_user", ["userId"]),

  // Service catalog (e.g. "MAT", "Ketamine"). `key` matches the optional
  // serviceKey on formAssignmentRules.
  services: defineTable({
    key: v.string(),
    name: v.string(),
    status: v.union(v.literal("active"), v.literal("archived")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_status", ["status"]),

  appointmentTypes: defineTable({
    serviceId: v.id("services"),
    key: v.string(), // matches formAssignmentRules.appointmentType
    name: v.string(),
    durationMinutes: v.number(),
    bufferBeforeMinutes: v.number(),
    bufferAfterMinutes: v.number(),
    locationId: v.id("locations"),
    eligibleProviderIds: v.array(v.id("providers")),
    requiredResourceTypes: v.array(v.string()), // reserved for 10.3
    patientSelfSchedulable: v.boolean(), // deferred feature; false today
    status: v.union(v.literal("active"), v.literal("archived")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_status", ["status"])
    .index("by_location", ["locationId", "status"]),

  // Bookable working hours. Exactly one of weekday (recurring) or date
  // (one-time) is set; minutes are local to the location's time zone.
  availabilityRules: defineTable({
    providerId: v.id("providers"),
    locationId: v.id("locations"),
    weekday: v.optional(v.number()), // 0=Sunday … 6=Saturday
    date: v.optional(v.string()), // ISO YYYY-MM-DD, one-time availability
    startMinute: v.number(),
    endMinute: v.number(),
    effectiveFrom: v.optional(v.string()), // ISO YYYY-MM-DD
    effectiveTo: v.optional(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_provider", ["providerId", "active"]),

  // Blocked intervals. Stored as canonical instants, so an all-day block
  // means the same wall-clock day regardless of DST.
  timeOff: defineTable({
    providerId: v.id("providers"),
    startAt: v.number(),
    endAt: v.number(),
    reason: v.string(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  }).index("by_provider_start", ["providerId", "startAt"]),

  // Rooms and monitoring capacity. Reservation logic arrives with 10.3.
  resources: defineTable({
    locationId: v.id("locations"),
    name: v.string(),
    type: v.string(), // "room" | "monitoring" | equipment key
    status: v.union(v.literal("active"), v.literal("archived")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_location", ["locationId", "status"]),

  appointments: defineTable({
    patientId: v.id("patients"),
    appointmentTypeId: v.id("appointmentTypes"),
    providerId: v.id("providers"),
    locationId: v.id("locations"),
    startAt: v.number(), // canonical UTC ms
    endAt: v.number(),
    timeZone: v.string(), // location time zone at booking time
    status: appointmentStatusValidator,
    cancellationReason: v.optional(v.string()),
    cancellationCategory: v.optional(v.string()), // e.g. "patient", "practice"
    noShowRecordedAt: v.optional(v.number()),
    resourceIds: v.optional(v.array(v.id("resources"))),
    rescheduledFromId: v.optional(v.id("appointments")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_provider_start", ["providerId", "startAt"])
    .index("by_patient_start", ["patientId", "startAt"])
    .index("by_location_start", ["locationId", "startAt"])
    .index("by_status_start", ["status", "startAt"])
    .index("by_start", ["startAt"]),

  // Captured demand. Conversion to an appointment is always a deliberate
  // staff action through the normal booking checks — no automated matching.
  waitlistEntries: defineTable({
    patientId: v.id("patients"),
    appointmentTypeId: v.id("appointmentTypes"),
    locationId: v.optional(v.id("locations")),
    preferredProviderId: v.optional(v.id("providers")),
    fromDate: v.string(), // ISO YYYY-MM-DD window the patient can attend
    toDate: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("contacted"),
      v.literal("converted"),
      v.literal("cancelled"),
    ),
    note: v.optional(v.string()), // operational only, never clinical detail
    convertedAppointmentId: v.optional(v.id("appointments")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status", "fromDate"])
    .index("by_patient", ["patientId"]),

  // Append-only lifecycle history. One row per transition, never edited.
  appointmentEvents: defineTable({
    appointmentId: v.id("appointments"),
    fromStatus: v.optional(appointmentStatusValidator),
    toStatus: appointmentStatusValidator,
    reason: v.optional(v.string()),
    actorUserId: v.id("users"),
    createdAt: v.number(),
  }).index("by_appointment", ["appointmentId", "createdAt"]),

  pharmacies: defineTable({
    patientId: v.id("patients"),
    name: v.string(),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    isPreferred: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_patient", ["patientId"]),
});
