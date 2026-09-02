import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { requireCapability } from "../lib/access";
import { serviceBlockReason } from "../lib/administration";
import { writeAudit } from "../lib/audit";
import { normalizeEmail, normalizePhone } from "../lib/patients";
import { rangesOverlap } from "../lib/scheduling";
import {
  generateSlots,
  type AvailabilityWindow,
  type BusyInterval,
} from "../lib/slots";
import {
  addDays,
  datesBetween,
  formatLocalTime,
  isIsoDate,
  MINUTE_MS,
  zonedParts,
} from "../lib/time";

const MAX_RANGE_DAYS = 31;
const DAY_MS = 24 * 60 * MINUTE_MS;
const DEFAULT_SETTINGS = {
  slotMinutes: 60,
  leadTimeHours: 24,
  horizonDays: 60,
};
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

type BookingCtx = QueryCtx | MutationCtx;

async function activeLocation(ctx: BookingCtx) {
  const locations = await ctx.db
    .query("locations")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .collect();
  if (locations.length !== 1) {
    throw new Error("Booking requires exactly one active location");
  }
  return locations[0];
}

async function bookingSettings(ctx: BookingCtx, locationId: Id<"locations">) {
  const settings = await ctx.db
    .query("practiceBookingSettings")
    .withIndex("by_location", (q) => q.eq("locationId", locationId))
    .unique();
  return settings ?? DEFAULT_SETTINGS;
}

async function computeSlots(
  ctx: BookingCtx,
  { fromDate, toDate }: { fromDate: string; toDate: string },
) {
  const location = await activeLocation(ctx);
  const [hours, settings] = await Promise.all([
    ctx.db
      .query("practiceHours")
      .withIndex("by_location", (q) =>
        q.eq("locationId", location._id).eq("active", true),
      )
      .collect(),
    bookingSettings(ctx, location._id),
  ]);
  const windowStart = Date.parse(`${fromDate}T00:00:00Z`) - DAY_MS;
  const windowEnd = Date.parse(`${addDays(toDate, 1)}T00:00:00Z`) + DAY_MS;
  const bookings = await ctx.db
    .query("bookings")
    .withIndex("by_status_start", (q) =>
      q
        .eq("status", "booked")
        .gte("startAt", windowStart)
        .lte("startAt", windowEnd),
    )
    .collect();
  const rules: AvailabilityWindow[] = hours.map((hour) => ({
    weekday: hour.weekday,
    startMinute: hour.startMinute,
    endMinute: hour.endMinute,
  }));
  const busy: BusyInterval[] = bookings.map(({ startAt, endAt }) => ({
    startAt,
    endAt,
  }));
  const now = Date.now();
  const today = zonedParts(now, location.timeZone).date;
  const earliest = now + settings.leadTimeHours * 60 * MINUTE_MS;
  const latestDate = addDays(today, settings.horizonDays);

  return generateSlots({
    timeZone: location.timeZone,
    fromDate,
    toDate,
    durationMinutes: settings.slotMinutes,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    rules,
    busy,
  })
    .filter((slot) => slot.startAt >= earliest && slot.date <= latestDate)
    .map((slot) => ({ ...slot, timeZone: location.timeZone }));
}

function assertDateRange(fromDate: string, toDate: string): void {
  if (!isIsoDate(fromDate) || !isIsoDate(toDate)) {
    throw new Error("Dates must be YYYY-MM-DD");
  }
  if (fromDate > toDate) throw new Error("Range ends before it starts");
  if (datesBetween(fromDate, toDate).length > MAX_RANGE_DAYS) {
    throw new Error(`Range cannot exceed ${MAX_RANGE_DAYS} days`);
  }
}

// Public by design: the booking form needs the bookable catalog before login.
export const publicServices = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    return (await ctx.db.query("services").collect())
      .filter((service) => serviceBlockReason(service, now) === null)
      .map((service) => ({ serviceId: service._id, name: service.name }));
  },
});

// Public by design: availability contains only times, never booking identity.
export const publicSlots = query({
  args: { fromDate: v.string(), toDate: v.string() },
  handler: async (ctx, { fromDate, toDate }) => {
    assertDateRange(fromDate, toDate);
    return await computeSlots(ctx, { fromDate, toDate });
  },
});

// Internal only: the public action verifies captcha before invoking this write.
export const insertBooking = internalMutation({
  args: {
    fullName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    serviceId: v.id("services"),
    startAt: v.number(),
  },
  handler: async (ctx, args) => {
    const fullName = args.fullName.trim();
    if (!fullName || fullName.length > 120) {
      throw new Error(
        "Full name is required and must be at most 120 characters",
      );
    }
    const email = args.email?.trim() || undefined;
    const phone = args.phone?.trim() || undefined;
    if (!email && !phone) throw new Error("Email or phone is required");
    if (email && !EMAIL_PATTERN.test(email)) throw new Error("Invalid email");
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedEmail && !normalizedPhone) {
      throw new Error("Email or phone is required");
    }

    const service = await ctx.db.get(args.serviceId);
    if (!service || serviceBlockReason(service, Date.now()) !== null) {
      throw new Error("Service is not available");
    }
    const location = await activeLocation(ctx);
    const date = zonedParts(args.startAt, location.timeZone).date;
    const slot = (
      await computeSlots(ctx, { fromDate: date, toDate: date })
    ).find((candidate) => candidate.startAt === args.startAt);
    if (!slot)
      return { ok: false as const, reason: "slotUnavailable" as const };

    const matches = new Set<string>();
    if (normalizedEmail) {
      const rows = await ctx.db
        .query("bookings")
        .withIndex("by_email", (q) => q.eq("normalizedEmail", normalizedEmail))
        .collect();
      rows
        .filter((row) => row.status === "booked" && row.startAt > Date.now())
        .forEach((row) => matches.add(row._id));
    }
    if (normalizedPhone) {
      const rows = await ctx.db
        .query("bookings")
        .withIndex("by_phone", (q) => q.eq("normalizedPhone", normalizedPhone))
        .collect();
      rows
        .filter((row) => row.status === "booked" && row.startAt > Date.now())
        .forEach((row) => matches.add(row._id));
    }
    if (matches.size >= 3) {
      return { ok: false as const, reason: "tooManyBookings" as const };
    }

    const now = Date.now();
    const bookingId = await ctx.db.insert("bookings", {
      fullName,
      email,
      phone,
      normalizedEmail,
      normalizedPhone,
      serviceId: service._id,
      serviceName: service.name,
      locationId: location._id,
      startAt: slot.startAt,
      endAt: slot.endAt,
      timeZone: slot.timeZone,
      status: "booked",
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      action: "booking.created",
      entityType: "bookings",
      entityId: bookingId,
    });
    return { ok: true as const };
  },
});

export const listBookings = query({
  args: {
    fromDate: v.string(),
    toDate: v.string(),
    status: v.optional(
      v.union(
        v.literal("booked"),
        v.literal("completed"),
        v.literal("cancelled"),
        v.literal("noShow"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, "appointment.manage");
    assertDateRange(args.fromDate, args.toDate);
    const windowStart = Date.parse(`${args.fromDate}T00:00:00Z`) - DAY_MS;
    const windowEnd =
      Date.parse(`${addDays(args.toDate, 1)}T00:00:00Z`) + DAY_MS;
    const rows = args.status
      ? await ctx.db
          .query("bookings")
          .withIndex("by_status_start", (q) =>
            q
              .eq("status", args.status!)
              .gte("startAt", windowStart)
              .lte("startAt", windowEnd),
          )
          .collect()
      : await ctx.db
          .query("bookings")
          .withIndex("by_start", (q) =>
            q.gte("startAt", windowStart).lte("startAt", windowEnd),
          )
          .collect();
    return rows
      .filter((row) => {
        const date = zonedParts(row.startAt, row.timeZone).date;
        return date >= args.fromDate && date <= args.toDate;
      })
      .map((row) => ({
        ...row,
        date: zonedParts(row.startAt, row.timeZone).date,
        localTime: formatLocalTime(row.startAt, row.timeZone),
      }));
  },
});

export const setBookingStatus = mutation({
  args: {
    bookingId: v.id("bookings"),
    status: v.union(
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("noShow"),
    ),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { bookingId, status, reason }) => {
    const actor = await requireCapability(ctx, "appointment.manage");
    const booking = await ctx.db.get(bookingId);
    if (!booking) throw new Error("Booking not found");
    if (booking.status !== "booked") throw new Error("Booking is terminal");
    if ((status === "cancelled" || status === "noShow") && !reason?.trim()) {
      throw new Error("A reason is required");
    }
    await ctx.db.patch(bookingId, {
      status,
      cancellationReason: reason?.trim() || undefined,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: `booking.${status}`,
      entityType: "bookings",
      entityId: bookingId,
      reason: reason?.trim() || undefined,
    });
  },
});

export const listPracticeHours = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "config.manage");
    const location = await activeLocation(ctx);
    return await ctx.db
      .query("practiceHours")
      .withIndex("by_location", (q) =>
        q.eq("locationId", location._id).eq("active", true),
      )
      .collect();
  },
});

export const setPracticeHours = mutation({
  args: {
    hours: v.array(
      v.object({
        weekday: v.number(),
        startMinute: v.number(),
        endMinute: v.number(),
      }),
    ),
    reason: v.string(),
  },
  handler: async (ctx, { hours, reason }) => {
    const actor = await requireCapability(ctx, "config.manage");
    if (!reason.trim()) throw new Error("A reason is required");
    for (const hour of hours) {
      if (
        !Number.isInteger(hour.weekday) ||
        hour.weekday < 0 ||
        hour.weekday > 6 ||
        !Number.isInteger(hour.startMinute) ||
        !Number.isInteger(hour.endMinute) ||
        hour.startMinute < 0 ||
        hour.startMinute >= hour.endMinute ||
        hour.endMinute > 1440
      ) {
        throw new Error("Practice hours are invalid");
      }
      if (
        hours.some(
          (other) =>
            other !== hour &&
            other.weekday === hour.weekday &&
            rangesOverlap(
              hour.startMinute,
              hour.endMinute,
              other.startMinute,
              other.endMinute,
            ),
        )
      ) {
        throw new Error("Practice hours cannot overlap");
      }
    }
    const location = await activeLocation(ctx);
    const existing = await ctx.db
      .query("practiceHours")
      .withIndex("by_location", (q) =>
        q.eq("locationId", location._id).eq("active", true),
      )
      .collect();
    const now = Date.now();
    await Promise.all(
      existing.map((row) =>
        ctx.db.patch(row._id, { active: false, updatedAt: now }),
      ),
    );
    await Promise.all(
      hours.map((hour) =>
        ctx.db.insert("practiceHours", {
          locationId: location._id,
          ...hour,
          active: true,
          createdAt: now,
          updatedAt: now,
        }),
      ),
    );
    await writeAudit(ctx, {
      actor,
      action: "booking.practice_hours.updated",
      entityType: "locations",
      entityId: location._id,
      reason: reason.trim(),
    });
  },
});

export const getBookingSettings = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "config.manage");
    const location = await activeLocation(ctx);
    const settings = await bookingSettings(ctx, location._id);
    return {
      slotMinutes: settings.slotMinutes,
      leadTimeHours: settings.leadTimeHours,
      horizonDays: settings.horizonDays,
    };
  },
});

export const setBookingSettings = mutation({
  args: {
    slotMinutes: v.number(),
    leadTimeHours: v.number(),
    horizonDays: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "config.manage");
    if (!args.reason.trim()) throw new Error("A reason is required");
    if (
      !Number.isInteger(args.slotMinutes) ||
      args.slotMinutes < 1 ||
      args.slotMinutes > 1440 ||
      !Number.isInteger(args.leadTimeHours) ||
      args.leadTimeHours < 0 ||
      !Number.isInteger(args.horizonDays) ||
      args.horizonDays < 1
    ) {
      throw new Error("Booking settings are invalid");
    }
    const location = await activeLocation(ctx);
    const existing = await ctx.db
      .query("practiceBookingSettings")
      .withIndex("by_location", (q) => q.eq("locationId", location._id))
      .unique();
    const values = {
      slotMinutes: args.slotMinutes,
      leadTimeHours: args.leadTimeHours,
      horizonDays: args.horizonDays,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, values);
    } else {
      await ctx.db.insert("practiceBookingSettings", {
        locationId: location._id,
        ...values,
        createdAt: values.updatedAt,
      });
    }
    await writeAudit(ctx, {
      actor,
      action: "booking.settings.updated",
      entityType: "locations",
      entityId: location._id,
      reason: args.reason.trim(),
    });
  },
});
