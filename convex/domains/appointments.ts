import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { requireCapability, requireLinkedPatient } from "../lib/access";
import { writeAudit } from "../lib/audit";
import { generateSlots, type BusyInterval } from "../lib/slots";
import {
  allowedTransitions,
  appointmentStatusValidator,
  canTransition,
  occupiesSlot,
  type AppointmentStatus,
} from "../lib/scheduling";
import { buildReadiness } from "../lib/readiness";
import {
  addDays,
  datesBetween,
  formatLocalTime,
  isIsoDate,
  zonedParts,
} from "../lib/time";
import { materializeAssignments } from "./assignments";
import { activeRules } from "./scheduling";

// Slot availability. Calculation is server-side only: the client never sees
// availability rules, so it cannot construct a slot the server would reject.

const MAX_RANGE_DAYS = 31;
/** Longest possible appointment footprint; bounds the backwards scan for
 * appointments that started before the requested window. */
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

/** Time off plus appointments that still hold their slot, as plain intervals. */
export async function busyIntervals(
  ctx: QueryCtx,
  providerId: Id<"providers">,
  windowStart: number,
  windowEnd: number,
): Promise<BusyInterval[]> {
  const [timeOff, appointments] = await Promise.all([
    ctx.db
      .query("timeOff")
      .withIndex("by_provider_start", (q) =>
        q.eq("providerId", providerId).lte("startAt", windowEnd),
      )
      .collect(),
    ctx.db
      .query("appointments")
      .withIndex("by_provider_start", (q) =>
        q
          .eq("providerId", providerId)
          .gte("startAt", windowStart - LOOKBACK_MS)
          .lte("startAt", windowEnd),
      )
      .collect(),
  ]);
  return [
    ...timeOff
      .filter((t) => t.endAt > windowStart)
      .map((t) => ({ startAt: t.startAt, endAt: t.endAt })),
    ...appointments
      .filter((a) => occupiesSlot(a.status) && a.endAt > windowStart)
      .map((a) => ({ startAt: a.startAt, endAt: a.endAt })),
  ];
}

export interface SlotContext {
  appointmentType: Doc<"appointmentTypes">;
  location: Doc<"locations">;
}

async function loadSlotContext(
  ctx: QueryCtx,
  appointmentTypeId: Id<"appointmentTypes">,
): Promise<SlotContext> {
  const appointmentType = await ctx.db.get(appointmentTypeId);
  if (!appointmentType || appointmentType.status !== "active") {
    throw new Error("Appointment type not found or archived");
  }
  const location = await ctx.db.get(appointmentType.locationId);
  if (!location || location.status !== "active") {
    throw new Error("Location not found or archived");
  }
  return { appointmentType, location };
}

/**
 * Slots for one provider over a local date range. Shared by the staff slot
 * picker and by the booking mutation's conflict recheck, so both answer the
 * same question with the same rules.
 */
export async function slotsForProvider(
  ctx: QueryCtx,
  args: {
    context: SlotContext;
    providerId: Id<"providers">;
    fromDate: string;
    toDate: string;
  },
) {
  const { appointmentType, location } = args.context;
  const rules = (await activeRules(ctx, args.providerId)).filter(
    (r) => r.locationId === appointmentType.locationId,
  );
  if (rules.length === 0) return [];

  // Bound the busy scan by the widest possible instants for the local range.
  const windowStart = Date.parse(`${args.fromDate}T00:00:00Z`) - LOOKBACK_MS;
  const windowEnd =
    Date.parse(`${addDays(args.toDate, 1)}T00:00:00Z`) + LOOKBACK_MS;
  const busy = await busyIntervals(
    ctx,
    args.providerId,
    windowStart,
    windowEnd,
  );

  return generateSlots({
    timeZone: location.timeZone,
    fromDate: args.fromDate,
    toDate: args.toDate,
    durationMinutes: appointmentType.durationMinutes,
    bufferBeforeMinutes: appointmentType.bufferBeforeMinutes,
    bufferAfterMinutes: appointmentType.bufferAfterMinutes,
    rules,
    busy,
  });
}

export function assertDateRange(fromDate: string, toDate: string): void {
  if (!isIsoDate(fromDate) || !isIsoDate(toDate)) {
    throw new Error("Dates must be YYYY-MM-DD");
  }
  if (fromDate > toDate) throw new Error("Range ends before it starts");
  if (datesBetween(fromDate, toDate).length > MAX_RANGE_DAYS) {
    throw new Error(`Range cannot exceed ${MAX_RANGE_DAYS} days`);
  }
}

/**
 * Operational row for calendars and the daily queue. Deliberately narrow:
 * identity, timing, and operational status only — no clinical content ever
 * reaches a calendar cell.
 */
async function toScheduleRow(ctx: QueryCtx, appointment: Doc<"appointments">) {
  const [patient, type, provider, location] = await Promise.all([
    ctx.db.get(appointment.patientId),
    ctx.db.get(appointment.appointmentTypeId),
    ctx.db.get(appointment.providerId),
    ctx.db.get(appointment.locationId),
  ]);
  const local = zonedParts(appointment.startAt, appointment.timeZone);
  const readiness = patient ? await buildReadiness(ctx, patient) : null;
  return {
    _id: appointment._id,
    patientId: appointment.patientId,
    patientName: patient
      ? `${patient.legalLastName}, ${patient.preferredName ?? patient.legalFirstName}`
      : "(unknown)",
    appointmentTypeName: type?.name ?? "(archived)",
    providerName: provider?.displayName ?? "(archived)",
    locationName: location?.name ?? "(archived)",
    providerId: appointment.providerId,
    locationId: appointment.locationId,
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    timeZone: appointment.timeZone,
    date: local.date,
    localTime: formatLocalTime(appointment.startAt, appointment.timeZone),
    status: appointment.status,
    cancellationReason: appointment.cancellationReason,
    ready: readiness?.ready ?? false,
    missingCount: readiness
      ? readiness.items.filter((i) => !i.satisfied).length
      : 0,
  };
}

/**
 * Day/week schedule. Appointments are selected by instant and then filtered
 * on their own location-local date, so a range means the same calendar days
 * in every location time zone.
 */
export const listSchedule = query({
  args: {
    fromDate: v.string(),
    toDate: v.string(),
    providerId: v.optional(v.id("providers")),
    locationId: v.optional(v.id("locations")),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, "appointment.manage");
    await requireCapability(ctx, "patient.read");
    assertDateRange(args.fromDate, args.toDate);
    // One day of slack on each side covers every location's UTC offset.
    const windowStart = Date.parse(`${args.fromDate}T00:00:00Z`) - LOOKBACK_MS;
    const windowEnd =
      Date.parse(`${addDays(args.toDate, 1)}T00:00:00Z`) + LOOKBACK_MS;
    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_start", (q) =>
        q.gte("startAt", windowStart).lte("startAt", windowEnd),
      )
      .collect();

    const rows = [];
    for (const appointment of appointments) {
      if (args.providerId && appointment.providerId !== args.providerId)
        continue;
      if (args.locationId && appointment.locationId !== args.locationId)
        continue;
      const date = zonedParts(appointment.startAt, appointment.timeZone).date;
      if (date < args.fromDate || date > args.toDate) continue;
      rows.push(await toScheduleRow(ctx, appointment));
    }
    return rows.sort((a, b) => a.startAt - b.startAt);
  },
});

/** Appointment detail with its full, append-only event history. */
export const getAppointment = query({
  args: { appointmentId: v.id("appointments") },
  handler: async (ctx, { appointmentId }) => {
    await requireCapability(ctx, "appointment.manage");
    await requireCapability(ctx, "patient.read");
    const appointment = await ctx.db.get(appointmentId);
    if (!appointment) return null;
    const events = await ctx.db
      .query("appointmentEvents")
      .withIndex("by_appointment", (q) => q.eq("appointmentId", appointmentId))
      .collect();
    const actors = await Promise.all(
      events.map((e) => ctx.db.get(e.actorUserId)),
    );
    return {
      ...(await toScheduleRow(ctx, appointment)),
      allowedTransitions: allowedTransitions(appointment.status),
      events: events.map((event, index) => ({
        _id: event._id,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        reason: event.reason,
        actorName: actors[index]?.displayName ?? "(unknown)",
        createdAt: event.createdAt,
      })),
    };
  },
});

/** Appointments for one patient, newest first. Powers the chart tab. */
export const listForPatient = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    await requireCapability(ctx, "patient.read");
    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_patient_start", (q) => q.eq("patientId", patientId))
      .order("desc")
      .collect();
    return await Promise.all(appointments.map((a) => toScheduleRow(ctx, a)));
  },
});

/** Appends a lifecycle event. Events are never edited or deleted. */
export async function recordEvent(
  ctx: MutationCtx,
  args: {
    appointmentId: Id<"appointments">;
    actorUserId: Id<"users">;
    toStatus: AppointmentStatus;
    fromStatus?: AppointmentStatus;
    reason?: string;
  },
): Promise<void> {
  await ctx.db.insert("appointmentEvents", { ...args, createdAt: Date.now() });
}

export const listAvailableSlots = query({
  args: {
    appointmentTypeId: v.id("appointmentTypes"),
    providerId: v.optional(v.id("providers")),
    fromDate: v.string(),
    toDate: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, "appointment.manage");
    assertDateRange(args.fromDate, args.toDate);
    const context = await loadSlotContext(ctx, args.appointmentTypeId);
    const providerIds = args.providerId
      ? context.appointmentType.eligibleProviderIds.filter(
          (id) => id === args.providerId,
        )
      : context.appointmentType.eligibleProviderIds;

    const result = [];
    for (const providerId of providerIds) {
      const provider = await ctx.db.get(providerId);
      if (!provider || provider.status !== "active") continue;
      const slots = await slotsForProvider(ctx, {
        context,
        providerId,
        fromDate: args.fromDate,
        toDate: args.toDate,
      });
      for (const slot of slots) {
        result.push({
          ...slot,
          providerId,
          providerName: provider.displayName,
          timeZone: context.location.timeZone,
        });
      }
    }
    return result.sort((a, b) => a.startAt - b.startAt);
  },
});

/**
 * Applies a lifecycle transition. Allowed transitions are defined once in
 * lib/scheduling and enforced here; the UI's action list is presentation.
 * Cancellation and no-show require a typed operational reason.
 */
export const transition = mutation({
  args: {
    appointmentId: v.id("appointments"),
    toStatus: appointmentStatusValidator,
    reason: v.optional(v.string()),
    cancellationCategory: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "appointment.manage");
    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment) throw new Error("Appointment not found");
    const from = appointment.status;
    if (!canTransition(from, args.toStatus)) {
      throw new Error(
        `Cannot move an appointment from ${from} to ${args.toStatus}`,
      );
    }
    const needsReason =
      args.toStatus === "cancelled" || args.toStatus === "noShow";
    if (needsReason && !args.reason?.trim()) {
      throw new Error("A reason is required");
    }

    const now = Date.now();
    await ctx.db.patch(args.appointmentId, {
      status: args.toStatus,
      updatedAt: now,
      ...(args.toStatus === "cancelled"
        ? {
            cancellationReason: args.reason,
            cancellationCategory: args.cancellationCategory ?? "practice",
          }
        : {}),
      ...(args.toStatus === "noShow" ? { noShowRecordedAt: now } : {}),
    });
    await recordEvent(ctx, {
      appointmentId: args.appointmentId,
      actorUserId: actor._id,
      fromStatus: from,
      toStatus: args.toStatus,
      reason: args.reason,
    });
    await writeAudit(ctx, {
      actor,
      action: `appointment.${args.toStatus}`,
      entityType: "appointments",
      entityId: args.appointmentId,
      reason: args.reason,
    });
  },
});

/**
 * Reschedules by cancelling the original and booking a replacement that
 * points back at it. History is preserved on both records; form
 * requirements are re-materialized idempotently, so nothing duplicates.
 * ponytail: reminder-job invalidation hooks in here in 6.5.
 */
export const reschedule = mutation({
  args: {
    appointmentId: v.id("appointments"),
    startAt: v.number(),
    providerId: v.optional(v.id("providers")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "appointment.manage");
    if (!args.reason.trim()) throw new Error("A reason is required");
    const original = await ctx.db.get(args.appointmentId);
    if (!original) throw new Error("Appointment not found");
    if (!canTransition(original.status, "cancelled")) {
      throw new Error(
        `Cannot reschedule an appointment that is ${original.status}`,
      );
    }
    const providerId = args.providerId ?? original.providerId;
    const context = await loadSlotContext(ctx, original.appointmentTypeId);
    if (!context.appointmentType.eligibleProviderIds.includes(providerId)) {
      throw new Error("Provider is not eligible for this appointment type");
    }

    // Free the original slot first so the new time may reuse it.
    const now = Date.now();
    await ctx.db.patch(args.appointmentId, {
      status: "cancelled",
      cancellationReason: args.reason,
      cancellationCategory: "reschedule",
      updatedAt: now,
    });
    await recordEvent(ctx, {
      appointmentId: args.appointmentId,
      actorUserId: actor._id,
      fromStatus: original.status,
      toStatus: "cancelled",
      reason: args.reason,
    });

    const { timeZone } = context.location;
    const date = zonedParts(args.startAt, timeZone).date;
    const slots = await slotsForProvider(ctx, {
      context,
      providerId,
      fromDate: date,
      toDate: date,
    });
    const slot = slots.find((s) => s.startAt === args.startAt);
    if (!slot) {
      // Nothing is committed on a failed reschedule: the original keeps its
      // slot and the caller can pick a different time.
      throw new Error("That time is no longer available");
    }

    const appointmentId = await ctx.db.insert("appointments", {
      patientId: original.patientId,
      appointmentTypeId: original.appointmentTypeId,
      providerId,
      locationId: context.location._id,
      startAt: slot.startAt,
      endAt: slot.endAt,
      timeZone,
      status: "scheduled",
      rescheduledFromId: args.appointmentId,
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await recordEvent(ctx, {
      appointmentId,
      actorUserId: actor._id,
      toStatus: "scheduled",
      reason: args.reason,
    });
    await writeAudit(ctx, {
      actor,
      action: "appointment.rescheduled",
      entityType: "appointments",
      entityId: appointmentId,
      reason: args.reason,
    });

    const service = await ctx.db.get(context.appointmentType.serviceId);
    const assignments = await materializeAssignments(ctx, {
      actor,
      patientId: original.patientId,
      serviceKey: service?.key,
      appointmentTypeKey: context.appointmentType.key,
    });
    return { appointmentId, formsAssigned: assignments.created };
  },
});

/** Upcoming and past appointments for the signed-in patient. */
export const listMyAppointments = query({
  args: {},
  handler: async (ctx) => {
    const { patient } = await requireLinkedPatient(ctx);
    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_patient_start", (q) => q.eq("patientId", patient._id))
      .order("desc")
      .collect();
    const rows = [];
    for (const appointment of appointments) {
      const type = await ctx.db.get(appointment.appointmentTypeId);
      const location = await ctx.db.get(appointment.locationId);
      rows.push({
        _id: appointment._id,
        date: zonedParts(appointment.startAt, appointment.timeZone).date,
        localTime: formatLocalTime(appointment.startAt, appointment.timeZone),
        timeZone: appointment.timeZone,
        startAt: appointment.startAt,
        appointmentTypeName: type?.name ?? "Appointment",
        locationName: location?.name ?? "",
        status: appointment.status,
        // Patient-initiated changes are configuration-gated, never assumed.
        cancellable:
          (type?.patientSelfSchedulable ?? false) &&
          canTransition(appointment.status, "cancelled"),
      });
    }
    return rows;
  },
});

/**
 * Patient-initiated cancellation. Permitted only when the appointment type
 * is configured for patient self-service; ownership is checked server-side.
 */
export const cancelMyAppointment = mutation({
  args: { appointmentId: v.id("appointments"), reason: v.string() },
  handler: async (ctx, { appointmentId, reason }) => {
    const { user, patient } = await requireLinkedPatient(ctx);
    if (!reason.trim()) throw new Error("A reason is required");
    const appointment = await ctx.db.get(appointmentId);
    if (!appointment || appointment.patientId !== patient._id) {
      throw new Error("Not authorized");
    }
    const type = await ctx.db.get(appointment.appointmentTypeId);
    if (!type?.patientSelfSchedulable) {
      throw new Error("Please call the practice to change this appointment");
    }
    if (!canTransition(appointment.status, "cancelled")) {
      throw new Error("This appointment can no longer be cancelled");
    }
    await ctx.db.patch(appointmentId, {
      status: "cancelled",
      cancellationReason: reason,
      cancellationCategory: "patient",
      updatedAt: Date.now(),
    });
    await recordEvent(ctx, {
      appointmentId,
      actorUserId: user._id,
      fromStatus: appointment.status,
      toStatus: "cancelled",
      reason,
    });
    await writeAudit(ctx, {
      actor: user,
      action: "appointment.cancelled",
      entityType: "appointments",
      entityId: appointmentId,
      reason,
    });
  },
});

/**
 * Books an appointment. Availability is recomputed inside the mutation and
 * the requested instant must still be an offered slot — Convex serializes
 * conflicting transactions, so two concurrent attempts on the same slot
 * cannot both succeed. A lost race returns a conflict result rather than
 * throwing, so the UI can refresh the picker instead of showing an error.
 */
export const book = mutation({
  args: {
    patientId: v.id("patients"),
    appointmentTypeId: v.id("appointmentTypes"),
    providerId: v.id("providers"),
    startAt: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "appointment.manage");
    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.status !== "active") {
      throw new Error("Patient not found or archived");
    }
    const context = await loadSlotContext(ctx, args.appointmentTypeId);
    if (
      !context.appointmentType.eligibleProviderIds.includes(args.providerId)
    ) {
      throw new Error("Provider is not eligible for this appointment type");
    }
    const provider = await ctx.db.get(args.providerId);
    if (!provider || provider.status !== "active") {
      throw new Error("Provider not found or archived");
    }

    const { timeZone } = context.location;
    const date = zonedParts(args.startAt, timeZone).date;
    const slots = await slotsForProvider(ctx, {
      context,
      providerId: args.providerId,
      fromDate: date,
      toDate: date,
    });
    const slot = slots.find((s) => s.startAt === args.startAt);
    if (!slot) {
      return { ok: false as const, reason: "slotUnavailable" as const };
    }

    const now = Date.now();
    const appointmentId = await ctx.db.insert("appointments", {
      patientId: args.patientId,
      appointmentTypeId: args.appointmentTypeId,
      providerId: args.providerId,
      locationId: context.location._id,
      startAt: slot.startAt,
      endAt: slot.endAt,
      timeZone,
      status: "scheduled",
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await recordEvent(ctx, {
      appointmentId,
      actorUserId: actor._id,
      toStatus: "scheduled",
    });
    await writeAudit(ctx, {
      actor,
      action: "appointment.booked",
      entityType: "appointments",
      entityId: appointmentId,
    });

    const service = await ctx.db.get(context.appointmentType.serviceId);
    const assignments = await materializeAssignments(ctx, {
      actor,
      patientId: args.patientId,
      serviceKey: service?.key,
      appointmentTypeKey: context.appointmentType.key,
    });

    return {
      ok: true as const,
      appointmentId,
      formsAssigned: assignments.created,
    };
  },
});
