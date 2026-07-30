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
    type: v.union(
      v.literal("intake"),
      v.literal("consent"),
      v.literal("assessment"),
    ),
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
    appointmentId: v.optional(v.id("appointments")),
    assessmentVersionId: v.optional(v.id("assessmentVersions")),
  })
    .index("by_patient", ["patientId", "status"])
    .index("by_patient_template", ["patientId", "templateId"]),

  // --- Mental health measurement (Increment 8) -----------------------
  // Instruments reuse the form engine for rendering and raw responses while
  // keeping controlled clinical metadata separate from ordinary intake.
  assessmentDefinitions: defineTable({
    name: v.string(),
    key: v.string(),
    status: v.union(v.literal("active"), v.literal("retired")),
    licensing: v.string(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_status", ["status"]),

  assessmentVersions: defineTable({
    assessmentDefinitionId: v.id("assessmentDefinitions"),
    formVersionId: v.id("formVersions"),
    version: v.number(),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("superseded"),
    ),
    scoring: v.object({
      fields: v.array(v.object({ key: v.string(), weight: v.number() })),
      interpretations: v.array(
        v.object({
          min: v.number(),
          max: v.number(),
          label: v.string(),
        }),
      ),
    }),
    responseRules: v.array(
      v.object({
        fieldKey: v.string(),
        equals: v.union(v.string(), v.number(), v.boolean()),
        instructions: v.string(),
      }),
    ),
    effectiveFrom: v.string(),
    effectiveTo: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_definition", ["assessmentDefinitionId", "version"])
    .index("by_definition_status", ["assessmentDefinitionId", "status"])
    .index("by_form_version", ["formVersionId"]),

  assessmentAssignments: defineTable({
    patientId: v.id("patients"),
    assessmentDefinitionId: v.id("assessmentDefinitions"),
    appointmentId: v.optional(v.id("appointments")),
    source: v.union(v.literal("appointmentType"), v.literal("manual")),
    status: v.union(v.literal("pending"), v.literal("completed")),
    reason: v.optional(v.string()),
    responseId: v.optional(v.id("formResponses")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_patient", ["patientId", "status"])
    .index("by_patient_definition", [
      "patientId",
      "assessmentDefinitionId",
      "status",
    ])
    .index("by_appointment", ["appointmentId"]),

  assessmentAppointmentRules: defineTable({
    appointmentTypeId: v.id("appointmentTypes"),
    assessmentDefinitionId: v.id("assessmentDefinitions"),
    active: v.boolean(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_appointment_type", ["appointmentTypeId", "active"]),

  clinicalReviewTasks: defineTable({
    patientId: v.id("patients"),
    responseId: v.id("formResponses"),
    assessmentVersionId: v.id("assessmentVersions"),
    ruleKey: v.string(),
    priority: v.literal("high"),
    status: v.union(
      v.literal("open"),
      v.literal("acknowledged"),
      v.literal("resolved"),
    ),
    acknowledgedByUserId: v.optional(v.id("users")),
    acknowledgedAt: v.optional(v.number()),
    disposition: v.optional(v.string()),
    resolvedByUserId: v.optional(v.id("users")),
    resolvedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status", "createdAt"])
    .index("by_response_rule", ["responseId", "ruleKey"])
    .index("by_patient", ["patientId", "createdAt"]),

  psychiatricEvaluationConfigs: defineTable({
    name: v.string(),
    requiredSections: v.array(v.string()),
    optionalSections: v.array(v.string()),
    status: v.union(v.literal("active"), v.literal("retired")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status", ["status"]),

  psychiatricEvaluations: defineTable({
    encounterId: v.id("encounters"),
    configId: v.id("psychiatricEvaluationConfigs"),
    status: v.union(v.literal("draft"), v.literal("signed")),
    sections: v.any(),
    patientReportedSections: v.array(v.string()),
    medicationIds: v.array(v.id("medications")),
    diagnosisIds: v.array(v.id("diagnoses")),
    assessmentResponseIds: v.array(v.id("formResponses")),
    revision: v.number(),
    signedAt: v.optional(v.number()),
    updatedByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_encounter", ["encounterId"]),

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

  // --- Clinical chart foundations (Increment 7) ----------------------
  allergies: defineTable({
    patientId: v.id("patients"),
    allergen: v.string(),
    reaction: v.optional(v.string()),
    severity: v.optional(
      v.union(v.literal("mild"), v.literal("moderate"), v.literal("severe")),
    ),
    status: v.union(v.literal("active"), v.literal("inactive")),
    onsetDate: v.optional(v.string()),
    source: v.union(v.literal("patient"), v.literal("clinician")),
    patientReported: v.boolean(),
    reconciliationStatus: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("rejected"),
    ),
    authorUserId: v.id("users"),
    statusReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_patient_status", ["patientId", "status"])
    .index("by_reconciliation", ["reconciliationStatus", "updatedAt"]),

  medications: defineTable({
    patientId: v.id("patients"),
    name: v.string(),
    dose: v.optional(v.string()),
    route: v.optional(v.string()),
    frequency: v.optional(v.string()),
    indication: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    source: v.union(v.literal("patient"), v.literal("clinician")),
    patientReported: v.boolean(),
    reconciliationStatus: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("rejected"),
    ),
    authorUserId: v.id("users"),
    statusReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_patient_status", ["patientId", "status"])
    .index("by_reconciliation", ["reconciliationStatus", "updatedAt"]),

  diagnoses: defineTable({
    patientId: v.id("patients"),
    codingSystem: v.string(),
    code: v.string(),
    display: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("resolved"),
      v.literal("enteredInError"),
    ),
    onsetDate: v.optional(v.string()),
    resolutionDate: v.optional(v.string()),
    authorUserId: v.id("users"),
    encounterId: v.optional(v.id("encounters")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_patient_status", ["patientId", "status"]),

  diagnosisEvents: defineTable({
    diagnosisId: v.id("diagnoses"),
    fromStatus: v.optional(
      v.union(
        v.literal("active"),
        v.literal("resolved"),
        v.literal("enteredInError"),
      ),
    ),
    toStatus: v.union(
      v.literal("active"),
      v.literal("resolved"),
      v.literal("enteredInError"),
    ),
    reason: v.string(),
    actorUserId: v.id("users"),
    createdAt: v.number(),
  }).index("by_diagnosis", ["diagnosisId", "createdAt"]),

  treatmentPlans: defineTable({
    patientId: v.id("patients"),
    title: v.string(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_patient", ["patientId", "updatedAt"]),

  treatmentPlanVersions: defineTable({
    planId: v.id("treatmentPlans"),
    version: v.number(),
    status: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("superseded"),
    ),
    followUp: v.optional(v.string()),
    createdByUserId: v.id("users"),
    activatedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_plan", ["planId", "version"])
    .index("by_plan_status", ["planId", "status"]),

  planGoals: defineTable({
    versionId: v.id("treatmentPlanVersions"),
    text: v.string(),
    patientVisible: v.boolean(),
    createdAt: v.number(),
  }).index("by_version", ["versionId"]),

  planActions: defineTable({
    versionId: v.id("treatmentPlanVersions"),
    text: v.string(),
    kind: v.union(
      v.literal("medication"),
      v.literal("referral"),
      v.literal("lifestyle"),
      v.literal("followUp"),
      v.literal("other"),
    ),
    linkedMedicationId: v.optional(v.id("medications")),
    patientVisible: v.boolean(),
    createdAt: v.number(),
  }).index("by_version", ["versionId"]),

  encounters: defineTable({
    patientId: v.id("patients"),
    appointmentId: v.id("appointments"),
    providerId: v.id("providers"),
    type: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("signed"),
      v.literal("amended"),
    ),
    startedAt: v.number(),
    signedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_patient", ["patientId", "startedAt"])
    .index("by_appointment", ["appointmentId"]),

  encounterDrafts: defineTable({
    encounterId: v.id("encounters"),
    sections: v.object({
      history: v.string(),
      assessment: v.string(),
      plan: v.string(),
      risk: v.string(),
      education: v.string(),
      followUp: v.string(),
    }),
    revision: v.number(),
    updatedByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_encounter", ["encounterId"]),

  signedEncounterNotes: defineTable({
    encounterId: v.id("encounters"),
    sections: v.object({
      history: v.string(),
      assessment: v.string(),
      plan: v.string(),
      risk: v.string(),
      education: v.string(),
      followUp: v.string(),
    }),
    draftRevision: v.number(),
    signerUserId: v.id("users"),
    signerDisplayName: v.string(),
    signedAt: v.number(),
  }).index("by_encounter", ["encounterId"]),

  encounterAmendments: defineTable({
    encounterId: v.id("encounters"),
    reason: v.string(),
    content: v.string(),
    authorUserId: v.id("users"),
    authorDisplayName: v.string(),
    signedAt: v.number(),
  }).index("by_encounter", ["encounterId", "signedAt"]),

  afterVisitSummaries: defineTable({
    encounterId: v.id("encounters"),
    patientId: v.id("patients"),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_encounter", ["encounterId"])
    .index("by_patient", ["patientId", "updatedAt"]),

  // --- MAT operational workflow (Increment 9) ------------------------
  // Sensitive substance-use records. Every read/write requires the
  // "mat.access" capability; content never reaches notifications or
  // general work queues — those carry neutral operational labels only.
  matEpisodes: defineTable({
    patientId: v.id("patients"),
    providerId: v.id("providers"),
    state: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("transferred"),
      v.literal("completed"),
      v.literal("archived"),
    ),
    stateReason: v.optional(v.string()),
    // Provider-entered next required follow-up (canonical UTC ms). Drives
    // the 9.5 queue; never triggers autonomous clinical action.
    nextFollowUpDueAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_patient", ["patientId", "state"])
    .index("by_provider", ["providerId", "state"])
    .index("by_state_due", ["state", "nextFollowUpDueAt"]),

  // Structured MAT intake/history with per-field provenance
  // (patient-reported vs clinician-verified). Reviewed by a provider.
  matAssessments: defineTable({
    episodeId: v.id("matEpisodes"),
    patientId: v.id("patients"),
    fields: v.array(
      v.object({
        key: v.string(),
        value: v.string(),
        source: v.union(v.literal("patient"), v.literal("clinician")),
        clinicianVerified: v.boolean(),
      }),
    ),
    reviewStatus: v.union(v.literal("pending"), v.literal("reviewed")),
    followUpQuestions: v.optional(v.string()),
    reviewedByUserId: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_episode", ["episodeId"])
    .index("by_review_status", ["reviewStatus", "createdAt"]),

  // Clinician-authored medication plan rows. Superseded, never edited.
  matMedicationPlans: defineTable({
    episodeId: v.id("matEpisodes"),
    medication: v.string(),
    dose: v.string(),
    frequency: v.string(),
    status: v.union(v.literal("active"), v.literal("superseded")),
    linkedMedicationId: v.optional(v.id("medications")),
    authorUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_episode", ["episodeId", "status"]),

  // Required MAT follow-up sections per appointment type; administrators
  // configure, defaults apply otherwise.
  matFollowUpConfigs: defineTable({
    appointmentTypeId: v.id("appointmentTypes"),
    requiredSections: v.array(v.string()),
    updatedByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_appointment_type", ["appointmentTypeId"]),

  // MAT follow-up documentation attached to a standard encounter. Signing,
  // locking, and amendments ride the encounter framework; signing also
  // copies nextFollowUpDueAt onto the episode for the 9.5 queue.
  matFollowUpNotes: defineTable({
    encounterId: v.id("encounters"),
    episodeId: v.id("matEpisodes"),
    medicationPlanId: v.optional(v.id("matMedicationPlans")),
    sections: v.any(), // Record<MatFollowUpSection, string>, validated on write
    nextFollowUpDueAt: v.optional(v.number()),
    status: v.union(v.literal("draft"), v.literal("signed")),
    revision: v.number(),
    signedAt: v.optional(v.number()),
    updatedByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_encounter", ["encounterId"])
    .index("by_episode", ["episodeId"]),

  // Manual toxicology entries. Corrections create a new version pointing at
  // the original via supersedesId; originals are never mutated.
  toxicologyRecords: defineTable({
    episodeId: v.id("matEpisodes"),
    patientId: v.id("patients"),
    specimenDate: v.string(), // ISO YYYY-MM-DD
    specimenType: v.string(),
    source: v.string(), // e.g. "in-office", "external lab" — adapter boundary for future lab integration
    status: v.union(
      v.literal("due"),
      v.literal("pending"),
      v.literal("reviewed"),
    ),
    resultSummary: v.optional(v.string()),
    reviewerUserId: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    supersedesId: v.optional(v.id("toxicologyRecords")),
    supersededById: v.optional(v.id("toxicologyRecords")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_episode", ["episodeId", "createdAt"])
    .index("by_status", ["status", "specimenDate"])
    .index("by_patient", ["patientId", "createdAt"]),

  // Recovery plan versions. Revisions supersede, never overwrite.
  recoveryPlans: defineTable({
    episodeId: v.id("matEpisodes"),
    version: v.number(),
    goals: v.string(),
    supports: v.string(),
    status: v.union(v.literal("active"), v.literal("superseded")),
    authorUserId: v.id("users"),
    createdAt: v.number(),
  }).index("by_episode", ["episodeId", "version"]),

  // Operational work items for the MAT queue (9.5). Labels are neutral —
  // never clinical detail — so the queue is safe outside chart views.
  monitoringEvents: defineTable({
    episodeId: v.id("matEpisodes"),
    kind: v.union(
      v.literal("followUpDue"),
      v.literal("toxicologyPending"),
      v.literal("intakeReviewPending"),
      v.literal("clinicalReview"),
    ),
    label: v.string(), // neutral operational text only
    dueAt: v.number(),
    status: v.union(
      v.literal("open"),
      v.literal("acknowledged"),
      v.literal("resolved"),
    ),
    assignedToUserId: v.optional(v.id("users")),
    acknowledgedByUserId: v.optional(v.id("users")),
    acknowledgedAt: v.optional(v.number()),
    disposition: v.optional(v.string()),
    resolvedByUserId: v.optional(v.id("users")),
    resolvedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_episode_kind", ["episodeId", "kind", "status"])
    .index("by_status_due", ["status", "dueAt"]),

  // --- Ketamine operational workflow (Increment 10) -------------------
  // A course is the longitudinal clinical approval; sessions are individual
  // treatment visits documented independently. The software enforces
  // operational hard stops only — eligibility is always a clinician decision.
  ketamineCourses: defineTable({
    patientId: v.id("patients"),
    approvingProviderId: v.id("providers"),
    appointmentTypeId: v.optional(v.id("appointmentTypes")),
    treatmentPlanId: v.optional(v.id("treatmentPlans")),
    state: v.union(
      v.literal("screening"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("archived"),
    ),
    stateReason: v.optional(v.string()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_patient", ["patientId", "state"])
    .index("by_state", ["state"]),

  // Clinician clearance decisions. Append-only: a new review supersedes by
  // recency, prior decisions are never edited or deleted.
  ketamineClearanceReviews: defineTable({
    courseId: v.id("ketamineCourses"),
    decision: v.union(
      v.literal("approved"),
      v.literal("deferred"),
      v.literal("declined"),
    ),
    rationale: v.string(),
    reviewerUserId: v.id("users"),
    createdAt: v.number(),
  }).index("by_course", ["courseId", "createdAt"]),

  // Configurable approved-protocol items. One table serves the 10.2 course
  // preconditions, the 10.4 pre-session checklist, and the 10.6 discharge
  // criteria; administrators manage rows, clinicians satisfy them.
  ketamineProtocolItems: defineTable({
    kind: v.union(
      v.literal("prerequisite"),
      v.literal("checklist"),
      v.literal("dischargeCriteria"),
    ),
    key: v.string(),
    label: v.string(),
    active: v.boolean(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_kind", ["kind", "active"]),

  // Which course preconditions have been verified, by whom. One row per
  // course+key; verification is a staff attestation, not a clinical decision.
  ketamineCoursePrerequisites: defineTable({
    courseId: v.id("ketamineCourses"),
    key: v.string(),
    satisfiedByUserId: v.id("users"),
    satisfiedAt: v.number(),
  }).index("by_course", ["courseId", "key"]),

  ketamineSessions: defineTable({
    courseId: v.id("ketamineCourses"),
    patientId: v.id("patients"),
    appointmentId: v.optional(v.id("appointments")),
    state: v.union(
      v.literal("planned"),
      v.literal("ready"),
      v.literal("inProgress"),
      v.literal("recovery"),
      v.literal("completed"),
      v.literal("cancelled"),
    ),
    stateReason: v.optional(v.string()),
    roomResourceId: v.optional(v.id("resources")),
    startedAt: v.optional(v.number()),
    startedByUserId: v.optional(v.id("users")),
    endedAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_course", ["courseId", "createdAt"])
    .index("by_state", ["state", "createdAt"])
    .index("by_appointment", ["appointmentId"]),

  // Pre-session checklist state (10.4). One row per session; each item
  // records the staff member who verified it.
  ketamineSessionChecklists: defineTable({
    sessionId: v.id("ketamineSessions"),
    items: v.array(
      v.object({
        key: v.string(),
        complete: v.boolean(),
        verifiedByUserId: v.optional(v.id("users")),
        verifiedAt: v.optional(v.number()),
      }),
    ),
    updatedAt: v.number(),
  }).index("by_session", ["sessionId"]),

  // Repeated in-session vital sign entries. Append-only with server
  // timestamps and recorder identity; phase distinguishes baseline,
  // monitoring, and discharge sets.
  sessionVitals: defineTable({
    sessionId: v.id("ketamineSessions"),
    phase: v.union(
      v.literal("baseline"),
      v.literal("monitoring"),
      v.literal("discharge"),
    ),
    systolic: v.number(),
    diastolic: v.number(),
    heartRate: v.number(),
    spo2: v.optional(v.number()),
    note: v.optional(v.string()),
    recorderUserId: v.id("users"),
    recordedAt: v.number(),
  }).index("by_session", ["sessionId", "recordedAt"]),

  // Timeline entries: observations and medication administrations share one
  // append-only stream so the session reconstructs in order.
  sessionObservations: defineTable({
    sessionId: v.id("ketamineSessions"),
    kind: v.union(
      v.literal("observation"),
      v.literal("medicationAdministration"),
    ),
    text: v.string(),
    medication: v.optional(v.string()),
    dose: v.optional(v.string()),
    route: v.optional(v.string()),
    observerUserId: v.id("users"),
    recordedAt: v.number(),
  }).index("by_session", ["sessionId", "recordedAt"]),

  adverseEvents: defineTable({
    sessionId: v.id("ketamineSessions"),
    description: v.string(),
    severity: v.union(
      v.literal("mild"),
      v.literal("moderate"),
      v.literal("severe"),
    ),
    actionsTaken: v.string(),
    reporterUserId: v.id("users"),
    recordedAt: v.number(),
  }).index("by_session", ["sessionId", "recordedAt"]),

  // One immutable discharge record per session; completion requires it.
  dischargeRecords: defineTable({
    sessionId: v.id("ketamineSessions"),
    criteria: v.array(v.object({ key: v.string(), met: v.boolean() })),
    recoveryAssessment: v.string(),
    escortConfirmed: v.boolean(),
    patientInstructions: v.string(),
    followUpPlan: v.optional(v.string()),
    overrideReason: v.optional(v.string()),
    dischargingUserId: v.id("users"),
    createdAt: v.number(),
  }).index("by_session", ["sessionId"]),

  afterVisitSummaryVersions: defineTable({
    summaryId: v.id("afterVisitSummaries"),
    version: v.number(),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("withdrawn"),
    ),
    content: v.string(),
    approvedByUserId: v.optional(v.id("users")),
    publishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_summary", ["summaryId", "version"])
    .index("by_summary_status", ["summaryId", "status"]),
});
