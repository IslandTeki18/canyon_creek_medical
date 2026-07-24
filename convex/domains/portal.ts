import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import {
  activeLinkForUser,
  requireAuthenticatedUser,
  requireLinkedPatient,
} from "../lib/access";
import { writeAudit } from "../lib/audit";
import { buildReadiness } from "../lib/readiness";
import {
  buildSearchText,
  normalizeEmail,
  normalizePhone,
} from "../lib/patients";

/**
 * Portal home, scoped through the caller's active patient link. Returns
 * null when the account is not linked yet so the client can offer the
 * invitation activation flow instead.
 */
export const myPortalHome = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthenticatedUser(ctx);
    const link = await activeLinkForUser(ctx, user._id);
    if (!link) return null;
    const patient = await ctx.db.get(link.patientId);
    if (!patient || patient.status !== "active") return null;

    // Readiness (4.6): profile fields plus assigned forms and consents,
    // computed by the same server-side calculation staff see.
    const readiness = await buildReadiness(ctx, patient);
    return {
      displayName: patient.preferredName ?? patient.legalFirstName,
      readiness,
    };
  },
});

/**
 * The caller's own profile. Staff-only identity fields (legal name, DOB)
 * are returned read-only for display; they are not accepted by any portal
 * mutation, so a crafted request cannot change them.
 */
export const myProfile = query({
  args: {},
  handler: async (ctx) => {
    const { patient } = await requireLinkedPatient(ctx);
    const [preference, contact, address, pharmacy] = await Promise.all([
      ctx.db
        .query("communicationPreferences")
        .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
        .unique(),
      ctx.db
        .query("emergencyContacts")
        .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
        .first(),
      ctx.db
        .query("patientAddresses")
        .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
        .first(),
      ctx.db
        .query("pharmacies")
        .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
        .first(),
    ]);
    return {
      readOnly: {
        legalFirstName: patient.legalFirstName,
        legalLastName: patient.legalLastName,
        dateOfBirth: patient.dateOfBirth,
      },
      preferredName: patient.preferredName,
      email: patient.email,
      phone: patient.phone,
      communicationPreference: preference,
      emergencyContact: contact,
      address,
      pharmacy,
    };
  },
});

// Patient-editable identity fields only (lib/patients.PATIENT_EDITABLE_FIELDS).
// The validator is the boundary: staff-only fields are not accepted at all.
export const updateMyProfile = mutation({
  args: {
    preferredName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, patient } = await requireLinkedPatient(ctx);
    if (args.email !== undefined && !/^\S+@\S+\.\S+$/.test(args.email.trim())) {
      throw new Error("Invalid email");
    }
    const next = {
      preferredName: args.preferredName?.trim() || undefined,
      email: args.email?.trim() || undefined,
      phone: args.phone?.trim() || undefined,
    };
    const changed = (Object.keys(next) as (keyof typeof next)[]).filter(
      (k) => next[k] !== patient[k],
    );
    if (changed.length === 0) return;

    await ctx.db.patch(patient._id, {
      ...next,
      normalizedEmail: normalizeEmail(next.email),
      normalizedPhone: normalizePhone(next.phone),
      searchText: buildSearchText({ ...patient, ...next }),
      updatedAt: Date.now(),
    });
    // Field-level audit: which fields changed, never their values (no PHI).
    for (const field of changed) {
      await writeAudit(ctx, {
        actor: user,
        action: `patient.profile.${field}_changed`,
        entityType: "patients",
        entityId: patient._id,
      });
    }
  },
});

/** Single home address, upserted. */
export const updateMyAddress = mutation({
  args: {
    line1: v.string(),
    line2: v.optional(v.string()),
    city: v.string(),
    state: v.string(),
    postalCode: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, patient } = await requireLinkedPatient(ctx);
    if (!args.line1.trim() || !args.city.trim() || !args.postalCode.trim()) {
      throw new Error("Address line, city, and postal code are required");
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("patientAddresses")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
    } else {
      await ctx.db.insert("patientAddresses", {
        patientId: patient._id,
        ...args,
        use: "home",
        createdAt: now,
        updatedAt: now,
      });
    }
    await writeAudit(ctx, {
      actor: user,
      action: "patient.profile.address_changed",
      entityType: "patients",
      entityId: patient._id,
    });
  },
});

/** Single emergency contact, upserted. */
export const updateMyEmergencyContact = mutation({
  args: { name: v.string(), relationship: v.string(), phone: v.string() },
  handler: async (ctx, args) => {
    const { user, patient } = await requireLinkedPatient(ctx);
    if (!args.name.trim() || !args.phone.trim()) {
      throw new Error("Name and phone are required");
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("emergencyContacts")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
    } else {
      await ctx.db.insert("emergencyContacts", {
        patientId: patient._id,
        ...args,
        createdAt: now,
        updatedAt: now,
      });
    }
    await writeAudit(ctx, {
      actor: user,
      action: "patient.profile.emergency_contact_changed",
      entityType: "patients",
      entityId: patient._id,
    });
  },
});

export const updateMyCommunicationPreferences = mutation({
  args: {
    smsOptIn: v.boolean(),
    emailOptIn: v.boolean(),
    voiceOptIn: v.boolean(),
    preferredChannel: v.union(
      v.literal("sms"),
      v.literal("email"),
      v.literal("voice"),
    ),
  },
  handler: async (ctx, args) => {
    const { user, patient } = await requireLinkedPatient(ctx);
    const now = Date.now();
    const existing = await ctx.db
      .query("communicationPreferences")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
    } else {
      await ctx.db.insert("communicationPreferences", {
        patientId: patient._id,
        ...args,
        createdAt: now,
        updatedAt: now,
      });
    }
    await writeAudit(ctx, {
      actor: user,
      action: "patient.profile.communication_preferences_changed",
      entityType: "patients",
      entityId: patient._id,
    });
  },
});

/** Single preferred pharmacy, upserted. */
export const updateMyPharmacy = mutation({
  args: {
    name: v.string(),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, patient } = await requireLinkedPatient(ctx);
    if (!args.name.trim()) throw new Error("Pharmacy name is required");
    const now = Date.now();
    const existing = await ctx.db
      .query("pharmacies")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
    } else {
      await ctx.db.insert("pharmacies", {
        patientId: patient._id,
        ...args,
        isPreferred: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    await writeAudit(ctx, {
      actor: user,
      action: "patient.profile.pharmacy_changed",
      entityType: "patients",
      entityId: patient._id,
    });
  },
});
