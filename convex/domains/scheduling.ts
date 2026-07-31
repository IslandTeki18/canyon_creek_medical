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
import { rangesOverlap } from "../lib/scheduling";
import { requireMigrationChoice } from "./administration";
import { DAY_MINUTES, isIsoDate, isValidTimeZone } from "../lib/time";

// Scheduling configuration: locations, providers, services, appointment
// types, working hours, and time off. Every write requires config.manage,
// validates contradictory configuration, and is audited.

const MAX_DURATION_MINUTES = 8 * 60;
const OPEN_START = "0000-01-01";
const OPEN_END = "9999-12-31";

// --- Locations -------------------------------------------------------

export const listLocations = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "appointment.manage");
    return await ctx.db.query("locations").collect();
  },
});

export const createLocation = mutation({
  args: { name: v.string(), timeZone: v.string() },
  handler: async (ctx, { name, timeZone }) => {
    const actor = await requireCapability(ctx, "config.manage");
    if (!name.trim()) throw new Error("A name is required");
    if (!isValidTimeZone(timeZone)) throw new Error("Unknown time zone");
    const now = Date.now();
    const locationId = await ctx.db.insert("locations", {
      name: name.trim(),
      timeZone,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "scheduling.location.created",
      entityType: "locations",
      entityId: locationId,
    });
    return locationId;
  },
});

export const setLocationStatus = mutation({
  args: {
    locationId: v.id("locations"),
    status: v.union(v.literal("active"), v.literal("archived")),
    reason: v.string(),
  },
  handler: async (ctx, { locationId, status, reason }) => {
    const actor = await requireCapability(ctx, "config.manage");
    if (!reason.trim()) throw new Error("A reason is required");
    const location = await ctx.db.get(locationId);
    if (!location) throw new Error("Location not found");
    if (status === "archived") {
      const types = await ctx.db
        .query("appointmentTypes")
        .withIndex("by_location", (q) =>
          q.eq("locationId", locationId).eq("status", "active"),
        )
        .first();
      if (types) {
        throw new Error("Archive the location's appointment types first");
      }
    }
    await ctx.db.patch(locationId, { status, updatedAt: Date.now() });
    await writeAudit(ctx, {
      actor,
      action: `scheduling.location.${status}`,
      entityType: "locations",
      entityId: locationId,
      reason,
    });
  },
});

// --- Providers -------------------------------------------------------

export const listProviders = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "appointment.manage");
    return await ctx.db.query("providers").collect();
  },
});

export const createProvider = mutation({
  args: {
    userId: v.id("users"),
    displayName: v.string(),
    defaultLocationId: v.optional(v.id("locations")),
  },
  handler: async (ctx, { userId, displayName, defaultLocationId }) => {
    const actor = await requireCapability(ctx, "config.manage");
    const user = await ctx.db.get(userId);
    if (!user || user.status !== "active") {
      throw new Error("User not found or inactive");
    }
    if (!user.roles.includes("provider")) {
      throw new Error("User does not hold the provider role");
    }
    const existing = await ctx.db
      .query("providers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) throw new Error("This user is already a provider");
    const now = Date.now();
    const providerId = await ctx.db.insert("providers", {
      userId,
      displayName: displayName.trim() || user.displayName,
      defaultLocationId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "scheduling.provider.created",
      entityType: "providers",
      entityId: providerId,
    });
    return providerId;
  },
});

export const setProviderStatus = mutation({
  args: {
    providerId: v.id("providers"),
    status: v.union(v.literal("active"), v.literal("archived")),
    reason: v.string(),
  },
  handler: async (ctx, { providerId, status, reason }) => {
    const actor = await requireCapability(ctx, "config.manage");
    if (!reason.trim()) throw new Error("A reason is required");
    const provider = await ctx.db.get(providerId);
    if (!provider) throw new Error("Provider not found");
    await ctx.db.patch(providerId, { status, updatedAt: Date.now() });
    await writeAudit(ctx, {
      actor,
      action: `scheduling.provider.${status}`,
      entityType: "providers",
      entityId: providerId,
      reason,
    });
  },
});

// --- Services and appointment types ----------------------------------

export const listServices = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "appointment.manage");
    return await ctx.db.query("services").collect();
  },
});

export const createService = mutation({
  args: { key: v.string(), name: v.string() },
  handler: async (ctx, { key, name }) => {
    const actor = await requireCapability(ctx, "config.manage");
    const normalizedKey = key.trim();
    if (!normalizedKey || !name.trim()) {
      throw new Error("A key and name are required");
    }
    const clash = await ctx.db
      .query("services")
      .withIndex("by_key", (q) => q.eq("key", normalizedKey))
      .first();
    if (clash) throw new Error("A service with that key already exists");
    const now = Date.now();
    const serviceId = await ctx.db.insert("services", {
      key: normalizedKey,
      name: name.trim(),
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "scheduling.service.created",
      entityType: "services",
      entityId: serviceId,
    });
    return serviceId;
  },
});

/** Appointment types with resolved location and provider names for staff UI. */
export const listAppointmentTypes = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "appointment.manage");
    const types = await ctx.db.query("appointmentTypes").collect();
    const result = [];
    for (const type of types) {
      const [location, service] = await Promise.all([
        ctx.db.get(type.locationId),
        ctx.db.get(type.serviceId),
      ]);
      const providers = await Promise.all(
        type.eligibleProviderIds.map((id) => ctx.db.get(id)),
      );
      result.push({
        ...type,
        locationName: location?.name ?? "(archived)",
        timeZone: location?.timeZone ?? "UTC",
        serviceName: service?.name ?? "(archived)",
        providerNames: providers.map((p) => p?.displayName ?? "(archived)"),
      });
    }
    return result;
  },
});

interface AppointmentTypeConfig {
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  eligibleProviderIds: Id<"providers">[];
}

async function validateAppointmentTypeConfig(
  ctx: MutationCtx,
  config: AppointmentTypeConfig,
): Promise<void> {
  const { durationMinutes, bufferBeforeMinutes, bufferAfterMinutes } = config;
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    throw new Error("Duration must be a positive whole number of minutes");
  }
  if (durationMinutes > MAX_DURATION_MINUTES) {
    throw new Error("Duration exceeds the configured maximum");
  }
  for (const buffer of [bufferBeforeMinutes, bufferAfterMinutes]) {
    if (!Number.isInteger(buffer) || buffer < 0) {
      throw new Error("Buffers must be zero or more whole minutes");
    }
  }
  if (
    durationMinutes + bufferBeforeMinutes + bufferAfterMinutes >
    DAY_MINUTES
  ) {
    throw new Error("Duration plus buffers cannot exceed one day");
  }
  if (config.eligibleProviderIds.length === 0) {
    throw new Error("At least one eligible provider is required");
  }
  for (const providerId of config.eligibleProviderIds) {
    const provider = await ctx.db.get(providerId);
    if (!provider || provider.status !== "active") {
      throw new Error("Eligible providers must be active");
    }
  }
}

export const createAppointmentType = mutation({
  args: {
    serviceId: v.id("services"),
    key: v.string(),
    name: v.string(),
    locationId: v.id("locations"),
    durationMinutes: v.number(),
    bufferBeforeMinutes: v.number(),
    bufferAfterMinutes: v.number(),
    eligibleProviderIds: v.array(v.id("providers")),
    requiredResourceTypes: v.optional(v.array(v.string())),
    patientSelfSchedulable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "config.manage");
    const key = args.key.trim();
    if (!key || !args.name.trim())
      throw new Error("A key and name are required");
    const clash = await ctx.db
      .query("appointmentTypes")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (clash) throw new Error("An appointment type with that key exists");
    const [service, location] = await Promise.all([
      ctx.db.get(args.serviceId),
      ctx.db.get(args.locationId),
    ]);
    if (!service || service.status !== "active") {
      throw new Error("Service not found or archived");
    }
    if (!location || location.status !== "active") {
      throw new Error("Location not found or archived");
    }
    await validateAppointmentTypeConfig(ctx, args);
    const now = Date.now();
    const typeId = await ctx.db.insert("appointmentTypes", {
      serviceId: args.serviceId,
      key,
      name: args.name.trim(),
      durationMinutes: args.durationMinutes,
      bufferBeforeMinutes: args.bufferBeforeMinutes,
      bufferAfterMinutes: args.bufferAfterMinutes,
      locationId: args.locationId,
      eligibleProviderIds: args.eligibleProviderIds,
      requiredResourceTypes: args.requiredResourceTypes ?? [],
      // Patient self-scheduling is a deferred feature: the flag is stored so
      // configuration survives, but no patient-facing booking path reads it.
      patientSelfSchedulable: args.patientSelfSchedulable ?? false,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "scheduling.appointmentType.created",
      entityType: "appointmentTypes",
      entityId: typeId,
    });
    return typeId;
  },
});

export const updateAppointmentType = mutation({
  args: {
    appointmentTypeId: v.id("appointmentTypes"),
    name: v.string(),
    durationMinutes: v.number(),
    bufferBeforeMinutes: v.number(),
    bufferAfterMinutes: v.number(),
    eligibleProviderIds: v.array(v.id("providers")),
    patientSelfSchedulable: v.boolean(),
  },
  handler: async (ctx, { appointmentTypeId, ...config }) => {
    const actor = await requireCapability(ctx, "config.manage");
    const type = await ctx.db.get(appointmentTypeId);
    if (!type || type.status !== "active") {
      throw new Error("Appointment type not found or archived");
    }
    if (!config.name.trim()) throw new Error("A name is required");
    await validateAppointmentTypeConfig(ctx, config);
    await ctx.db.patch(appointmentTypeId, {
      ...config,
      name: config.name.trim(),
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "scheduling.appointmentType.updated",
      entityType: "appointmentTypes",
      entityId: appointmentTypeId,
    });
  },
});

export const setAppointmentTypeStatus = mutation({
  args: {
    appointmentTypeId: v.id("appointmentTypes"),
    status: v.union(v.literal("active"), v.literal("archived")),
    reason: v.string(),
    // Required when archiving a type that future appointments still use.
    migration: v.optional(
      v.union(v.literal("keepExisting"), v.literal("cancelAffected")),
    ),
  },
  handler: async (ctx, { appointmentTypeId, status, reason, migration }) => {
    const actor = await requireCapability(ctx, "config.manage");
    if (!reason.trim()) throw new Error("A reason is required");
    const type = await ctx.db.get(appointmentTypeId);
    if (!type) throw new Error("Appointment type not found");
    // Archiving configuration that upcoming appointments depend on is a
    // deliberate decision, never a silent one (12.1).
    if (status === "archived" && type.status === "active") {
      await requireMigrationChoice(ctx, {
        actor,
        appointmentTypeIds: [appointmentTypeId],
        migration,
        reason: reason.trim(),
      });
    }
    await ctx.db.patch(appointmentTypeId, { status, updatedAt: Date.now() });
    await writeAudit(ctx, {
      actor,
      action: `scheduling.appointmentType.${status}`,
      entityType: "appointmentTypes",
      entityId: appointmentTypeId,
      reason,
    });
  },
});

// --- Working hours and time off --------------------------------------

export const listAvailability = query({
  args: { providerId: v.id("providers") },
  handler: async (ctx, { providerId }) => {
    await requireCapability(ctx, "appointment.manage");
    const [rules, off] = await Promise.all([
      ctx.db
        .query("availabilityRules")
        .withIndex("by_provider", (q) =>
          q.eq("providerId", providerId).eq("active", true),
        )
        .collect(),
      ctx.db
        .query("timeOff")
        .withIndex("by_provider_start", (q) => q.eq("providerId", providerId))
        .collect(),
    ]);
    return { rules, timeOff: off };
  },
});

/** Active rules for a provider. Shared with slot generation (5.3). */
export async function activeRules(
  ctx: QueryCtx,
  providerId: Id<"providers">,
): Promise<Doc<"availabilityRules">[]> {
  return await ctx.db
    .query("availabilityRules")
    .withIndex("by_provider", (q) =>
      q.eq("providerId", providerId).eq("active", true),
    )
    .collect();
}

/** Two rules conflict when they cover the same day and overlapping minutes
 * within overlapping effective windows. */
function rulesConflict(
  a: Pick<
    Doc<"availabilityRules">,
    | "weekday"
    | "date"
    | "startMinute"
    | "endMinute"
    | "effectiveFrom"
    | "effectiveTo"
  >,
  b: Doc<"availabilityRules">,
): boolean {
  const sameDay =
    a.date !== undefined ? a.date === b.date : a.weekday === b.weekday;
  if (!sameDay) return false;
  if (!rangesOverlap(a.startMinute, a.endMinute, b.startMinute, b.endMinute)) {
    return false;
  }
  const aFrom = a.effectiveFrom ?? OPEN_START;
  const aTo = a.effectiveTo ?? OPEN_END;
  const bFrom = b.effectiveFrom ?? OPEN_START;
  const bTo = b.effectiveTo ?? OPEN_END;
  return aFrom <= bTo && bFrom <= aTo;
}

export const createAvailabilityRule = mutation({
  args: {
    providerId: v.id("providers"),
    locationId: v.id("locations"),
    weekday: v.optional(v.number()),
    date: v.optional(v.string()),
    startMinute: v.number(),
    endMinute: v.number(),
    effectiveFrom: v.optional(v.string()),
    effectiveTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "config.manage");
    const { weekday, date, startMinute, endMinute } = args;
    if ((weekday === undefined) === (date === undefined)) {
      throw new Error("Provide either a weekday or a specific date");
    }
    if (
      weekday !== undefined &&
      !(Number.isInteger(weekday) && weekday >= 0 && weekday <= 6)
    ) {
      throw new Error("Weekday must be 0 (Sunday) through 6 (Saturday)");
    }
    if (date !== undefined && !isIsoDate(date)) {
      throw new Error("Date must be YYYY-MM-DD");
    }
    if (
      !Number.isInteger(startMinute) ||
      !Number.isInteger(endMinute) ||
      startMinute < 0 ||
      endMinute > DAY_MINUTES ||
      startMinute >= endMinute
    ) {
      throw new Error("Start must be before end and within the day");
    }
    for (const bound of [args.effectiveFrom, args.effectiveTo]) {
      if (bound !== undefined && !isIsoDate(bound)) {
        throw new Error("Effective dates must be YYYY-MM-DD");
      }
    }
    if (
      args.effectiveFrom &&
      args.effectiveTo &&
      args.effectiveFrom > args.effectiveTo
    ) {
      throw new Error("Effective range ends before it starts");
    }
    const [provider, location] = await Promise.all([
      ctx.db.get(args.providerId),
      ctx.db.get(args.locationId),
    ]);
    if (!provider || provider.status !== "active") {
      throw new Error("Provider not found or archived");
    }
    if (!location || location.status !== "active") {
      throw new Error("Location not found or archived");
    }
    const existing = await activeRules(ctx, args.providerId);
    if (existing.some((rule) => rulesConflict(args, rule))) {
      throw new Error("This overlaps an existing availability rule");
    }
    const now = Date.now();
    const ruleId = await ctx.db.insert("availabilityRules", {
      ...args,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "scheduling.availability.created",
      entityType: "availabilityRules",
      entityId: ruleId,
    });
    return ruleId;
  },
});

export const deactivateAvailabilityRule = mutation({
  args: { ruleId: v.id("availabilityRules"), reason: v.string() },
  handler: async (ctx, { ruleId, reason }) => {
    const actor = await requireCapability(ctx, "config.manage");
    if (!reason.trim()) throw new Error("A reason is required");
    const rule = await ctx.db.get(ruleId);
    if (!rule) throw new Error("Rule not found");
    await ctx.db.patch(ruleId, { active: false, updatedAt: Date.now() });
    await writeAudit(ctx, {
      actor,
      action: "scheduling.availability.deactivated",
      entityType: "availabilityRules",
      entityId: ruleId,
      reason,
    });
  },
});

export const createTimeOff = mutation({
  args: {
    providerId: v.id("providers"),
    startAt: v.number(),
    endAt: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, { providerId, startAt, endAt, reason }) => {
    const actor = await requireCapability(ctx, "config.manage");
    if (!reason.trim()) throw new Error("A reason is required");
    if (!(startAt < endAt)) throw new Error("Time off ends before it starts");
    const provider = await ctx.db.get(providerId);
    if (!provider) throw new Error("Provider not found");
    const existing = await ctx.db
      .query("timeOff")
      .withIndex("by_provider_start", (q) => q.eq("providerId", providerId))
      .collect();
    if (
      existing.some((t) => rangesOverlap(startAt, endAt, t.startAt, t.endAt))
    ) {
      throw new Error("This overlaps existing time off");
    }
    const timeOffId = await ctx.db.insert("timeOff", {
      providerId,
      startAt,
      endAt,
      reason,
      createdByUserId: actor._id,
      createdAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "scheduling.timeOff.created",
      entityType: "timeOff",
      entityId: timeOffId,
      reason,
    });
    return timeOffId;
  },
});

export const removeTimeOff = mutation({
  args: { timeOffId: v.id("timeOff"), reason: v.string() },
  handler: async (ctx, { timeOffId, reason }) => {
    const actor = await requireCapability(ctx, "config.manage");
    if (!reason.trim()) throw new Error("A reason is required");
    const off = await ctx.db.get(timeOffId);
    if (!off) throw new Error("Time off not found");
    await ctx.db.delete(timeOffId);
    await writeAudit(ctx, {
      actor,
      action: "scheduling.timeOff.removed",
      entityType: "timeOff",
      entityId: timeOffId,
      reason,
    });
  },
});
