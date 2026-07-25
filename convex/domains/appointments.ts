import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { requireCapability } from "../lib/access";
import { writeAudit } from "../lib/audit";
import { generateSlots, type BusyInterval } from "../lib/slots";
import { occupiesSlot, type AppointmentStatus } from "../lib/scheduling";
import { addDays, datesBetween, isIsoDate, zonedParts } from "../lib/time";
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
