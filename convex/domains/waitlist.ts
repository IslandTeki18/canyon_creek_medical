import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireCapability } from "../lib/access";
import { writeAudit } from "../lib/audit";
import { isIsoDate } from "../lib/time";
import { createBooking } from "./appointments";

// 5.7 — waitlist foundation. Demand is captured and worked by staff;
// nothing is matched or offered automatically. Conversion goes through the
// same booking checks as any other appointment.

const statusValidator = v.union(
  v.literal("open"),
  v.literal("contacted"),
  v.literal("converted"),
  v.literal("cancelled"),
);

export const list = query({
  args: { status: v.optional(statusValidator) },
  handler: async (ctx, { status }) => {
    await requireCapability(ctx, "appointment.manage");
    await requireCapability(ctx, "patient.read");
    const entries = status
      ? await ctx.db
          .query("waitlistEntries")
          .withIndex("by_status", (q) => q.eq("status", status))
          .collect()
      : await ctx.db.query("waitlistEntries").collect();

    const rows = [];
    for (const entry of entries) {
      const [patient, type, provider] = await Promise.all([
        ctx.db.get(entry.patientId),
        ctx.db.get(entry.appointmentTypeId),
        entry.preferredProviderId
          ? ctx.db.get(entry.preferredProviderId)
          : Promise.resolve(null),
      ]);
      rows.push({
        _id: entry._id,
        patientId: entry.patientId,
        patientName: patient
          ? `${patient.legalLastName}, ${patient.preferredName ?? patient.legalFirstName}`
          : "(unknown)",
        appointmentTypeId: entry.appointmentTypeId,
        appointmentTypeName: type?.name ?? "(archived)",
        preferredProviderId: entry.preferredProviderId,
        preferredProviderName: provider?.displayName,
        fromDate: entry.fromDate,
        toDate: entry.toDate,
        status: entry.status,
        note: entry.note,
        convertedAppointmentId: entry.convertedAppointmentId,
      });
    }
    return rows.sort((a, b) => a.fromDate.localeCompare(b.fromDate));
  },
});

export const addEntry = mutation({
  args: {
    patientId: v.id("patients"),
    appointmentTypeId: v.id("appointmentTypes"),
    preferredProviderId: v.optional(v.id("providers")),
    fromDate: v.string(),
    toDate: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "appointment.manage");
    if (!isIsoDate(args.fromDate) || !isIsoDate(args.toDate)) {
      throw new Error("Dates must be YYYY-MM-DD");
    }
    if (args.fromDate > args.toDate) {
      throw new Error("Range ends before it starts");
    }
    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.status !== "active") {
      throw new Error("Patient not found or archived");
    }
    const type = await ctx.db.get(args.appointmentTypeId);
    if (!type || type.status !== "active") {
      throw new Error("Appointment type not found or archived");
    }
    const now = Date.now();
    const entryId = await ctx.db.insert("waitlistEntries", {
      ...args,
      locationId: type.locationId,
      status: "open",
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "waitlist.created",
      entityType: "waitlistEntries",
      entityId: entryId,
    });
    return entryId;
  },
});

/** Records a contact attempt or removal. Both are audited with a reason. */
export const setStatus = mutation({
  args: {
    entryId: v.id("waitlistEntries"),
    status: v.union(
      v.literal("open"),
      v.literal("contacted"),
      v.literal("cancelled"),
    ),
    reason: v.string(),
  },
  handler: async (ctx, { entryId, status, reason }) => {
    const actor = await requireCapability(ctx, "appointment.manage");
    if (!reason.trim()) throw new Error("A reason is required");
    const entry = await ctx.db.get(entryId);
    if (!entry) throw new Error("Waitlist entry not found");
    if (entry.status === "converted") {
      throw new Error("Converted entries cannot be changed");
    }
    await ctx.db.patch(entryId, { status, updatedAt: Date.now() });
    await writeAudit(ctx, {
      actor,
      action: `waitlist.${status}`,
      entityType: "waitlistEntries",
      entityId: entryId,
      reason,
    });
  },
});

/**
 * Converts an entry into a real appointment. Uses the ordinary booking core,
 * so slot conflicts, provider eligibility, and form assignment behave
 * identically to staff booking; a taken slot returns a conflict result.
 */
export const convert = mutation({
  args: {
    entryId: v.id("waitlistEntries"),
    providerId: v.id("providers"),
    startAt: v.number(),
  },
  handler: async (ctx, { entryId, providerId, startAt }) => {
    const actor = await requireCapability(ctx, "appointment.manage");
    const entry = await ctx.db.get(entryId);
    if (!entry) throw new Error("Waitlist entry not found");
    if (entry.status === "converted" || entry.status === "cancelled") {
      throw new Error("This entry is no longer active");
    }
    const result = await createBooking(ctx, {
      actor,
      patientId: entry.patientId,
      appointmentTypeId: entry.appointmentTypeId,
      providerId,
      startAt,
    });
    if (!result.ok) return result;

    await ctx.db.patch(entryId, {
      status: "converted",
      convertedAppointmentId: result.appointmentId,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "waitlist.converted",
      entityType: "waitlistEntries",
      entityId: entryId,
    });
    return result;
  },
});
