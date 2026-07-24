import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
