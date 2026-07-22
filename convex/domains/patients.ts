import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { requireCapability } from "../lib/access";
import { writeAudit } from "../lib/audit";
import {
  buildSearchText,
  isValidDateOfBirth,
  normalizeEmail,
  normalizeName,
  normalizePhone,
} from "../lib/patients";

const identityArgs = {
  legalFirstName: v.string(),
  legalLastName: v.string(),
  preferredName: v.optional(v.string()),
  dateOfBirth: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
};

const communicationPreferenceArgs = {
  smsOptIn: v.boolean(),
  emailOptIn: v.boolean(),
  voiceOptIn: v.boolean(),
  preferredChannel: v.union(
    v.literal("sms"),
    v.literal("email"),
    v.literal("voice"),
  ),
};

/** Minimal fields staff need to distinguish candidates — no clinical data. */
function toCandidate(p: Doc<"patients">) {
  return {
    _id: p._id,
    legalFirstName: p.legalFirstName,
    legalLastName: p.legalLastName,
    dateOfBirth: p.dateOfBirth,
    status: p.status,
  };
}

/** Matches on last name + DOB, email, or phone. Shared by query and create. */
async function duplicateCandidatesFor(
  ctx: QueryCtx,
  input: {
    legalLastName: string;
    dateOfBirth: string;
    email?: string;
    phone?: string;
  },
): Promise<Doc<"patients">[]> {
  const lastName = normalizeName(input.legalLastName);
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const byName = await ctx.db
    .query("patients")
    .withIndex("by_last_name", (q) =>
      q.eq("normalizedLastName", lastName).eq("dateOfBirth", input.dateOfBirth),
    )
    .collect();
  const byEmail = email
    ? await ctx.db
        .query("patients")
        .withIndex("by_email", (q) => q.eq("normalizedEmail", email))
        .collect()
    : [];
  const byPhone = phone
    ? await ctx.db
        .query("patients")
        .withIndex("by_phone", (q) => q.eq("normalizedPhone", phone))
        .collect()
    : [];
  const unique = new Map(
    [...byName, ...byEmail, ...byPhone].map((p) => [p._id, p]),
  );
  return [...unique.values()];
}

function validateIdentity(input: {
  legalFirstName: string;
  legalLastName: string;
  dateOfBirth: string;
  email?: string;
}) {
  if (!input.legalFirstName.trim() || !input.legalLastName.trim()) {
    throw new Error("Legal first and last name are required");
  }
  if (!isValidDateOfBirth(input.dateOfBirth)) {
    throw new Error("Date of birth must be a past date in YYYY-MM-DD format");
  }
  if (input.email && !/^\S+@\S+\.\S+$/.test(input.email.trim())) {
    throw new Error("Invalid email");
  }
}

/**
 * Registry row: minimal identifying information sufficient to distinguish
 * patients — never clinical data.
 */
function toRegistryRow(p: Doc<"patients">) {
  return {
    _id: p._id,
    legalFirstName: p.legalFirstName,
    legalLastName: p.legalLastName,
    preferredName: p.preferredName,
    dateOfBirth: p.dateOfBirth,
    email: p.email,
    phone: p.phone,
    status: p.status,
  };
}

const statusFilter = v.optional(
  v.union(v.literal("active"), v.literal("archived")),
);

/**
 * Registry search across indexed fields. The term is routed to the matching
 * index: digits → phone, "@" → email, otherwise the name/DOB search index.
 * An empty term lists patients by status.
 */
export const searchPatients = query({
  args: {
    term: v.string(),
    status: statusFilter,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { term, status, paginationOpts }) => {
    await requireCapability(ctx, "patient.read");
    const trimmed = term.trim();
    const digits = trimmed.replace(/\D/g, "");

    let result;
    if (trimmed === "") {
      result = status
        ? await ctx.db
            .query("patients")
            .withIndex("by_status", (q) => q.eq("status", status))
            .order("desc")
            .paginate(paginationOpts)
        : await ctx.db.query("patients").order("desc").paginate(paginationOpts);
    } else if (trimmed.includes("@")) {
      result = await ctx.db
        .query("patients")
        .withIndex("by_email", (q) =>
          q.eq("normalizedEmail", trimmed.toLowerCase()),
        )
        .paginate(paginationOpts);
    } else if (digits.length >= 7 && /^[\d\s()+.-]+$/.test(trimmed)) {
      result = await ctx.db
        .query("patients")
        .withIndex("by_phone", (q) => q.eq("normalizedPhone", digits))
        .paginate(paginationOpts);
    } else {
      result = await ctx.db
        .query("patients")
        .withSearchIndex("search", (q) => {
          const search = q.search("searchText", trimmed.toLowerCase());
          return status ? search.eq("status", status) : search;
        })
        .paginate(paginationOpts);
    }
    return {
      ...result,
      // Status filter applies uniformly, including on email/phone routes.
      page: result.page
        .filter((p) => !status || p.status === status)
        .map(toRegistryRow),
    };
  },
});

/** Pre-creation duplicate check for the registration form. */
export const duplicateCandidates = query({
  args: {
    legalLastName: v.string(),
    dateOfBirth: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, "patient.manage");
    return (await duplicateCandidatesFor(ctx, args)).map(toCandidate);
  },
});

/**
 * Creates the patient and communication preference record in one transaction.
 * If duplicate candidates exist and the caller has not acknowledged them, no
 * record is created and the candidates are returned instead.
 */
export const createPatient = mutation({
  args: {
    ...identityArgs,
    communicationPreference: v.object(communicationPreferenceArgs),
    acknowledgedDuplicates: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "patient.manage");
    validateIdentity(args);
    const duplicates = await duplicateCandidatesFor(ctx, args);
    if (duplicates.length > 0 && !args.acknowledgedDuplicates) {
      return {
        created: false as const,
        duplicates: duplicates.map(toCandidate),
      };
    }
    const now = Date.now();
    const patientId = await ctx.db.insert("patients", {
      legalFirstName: args.legalFirstName.trim(),
      legalLastName: args.legalLastName.trim(),
      preferredName: args.preferredName?.trim() || undefined,
      dateOfBirth: args.dateOfBirth,
      email: args.email?.trim() || undefined,
      phone: args.phone?.trim() || undefined,
      status: "active",
      normalizedLastName: normalizeName(args.legalLastName),
      normalizedEmail: normalizeEmail(args.email),
      normalizedPhone: normalizePhone(args.phone),
      searchText: buildSearchText(args),
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("communicationPreferences", {
      patientId,
      ...args.communicationPreference,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "patient.created",
      entityType: "patients",
      entityId: patientId,
      reason:
        duplicates.length > 0
          ? "Created after acknowledging possible duplicates"
          : undefined,
    });
    return { created: true as const, patientId };
  },
});
