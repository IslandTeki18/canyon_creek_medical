import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { requireCapability } from "../lib/access";
import { generateSlots, type BusyInterval } from "../lib/slots";
import { occupiesSlot } from "../lib/scheduling";
import { addDays, datesBetween, isIsoDate } from "../lib/time";
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
