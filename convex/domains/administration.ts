// Service and appointment-type administration (Increment 12.1). One
// workspace resolves the whole configuration graph — appointment types,
// their reminder schedules, form assignment rules, required resources, and
// permitted providers — so an administrator can add a service using existing
// modules without a code change.
//
// Disabling configuration that future appointments depend on is refused
// until the administrator chooses a migration, because silently disabling it
// would leave those appointments pointing at configuration that no longer
// exists.
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx } from "../_generated/server";
import { requireCapability } from "../lib/access";
import { writeAudit } from "../lib/audit";
import { validateEffectiveWindow } from "../lib/administration";
import { ACTIVE_STATUSES } from "../lib/scheduling";
import { invalidateAppointmentJobs } from "./communications";

const serviceStatusValidator = v.union(
  v.literal("active"),
  v.literal("future"),
  v.literal("disabled"),
);

/** Migration choices when configuration still has future appointments. */
const migrationValidator = v.union(
  // Keep the appointments and let staff reschedule them by hand. The
  // configuration is disabled for new bookings only.
  v.literal("keepExisting"),
  // Cancel them, through the ordinary lifecycle so history and reminder
  // invalidation behave exactly as a manual cancellation would.
  v.literal("cancelAffected"),
);

async function futureAppointmentsFor(
  ctx: MutationCtx,
  appointmentTypeIds: Id<"appointmentTypes">[],
  now: number,
): Promise<Doc<"appointments">[]> {
  if (appointmentTypeIds.length === 0) return [];
  const ids = new Set(appointmentTypeIds);
  const upcoming = await ctx.db
    .query("appointments")
    .withIndex("by_start", (q) => q.gte("startAt", now))
    .collect();
  return upcoming.filter(
    (appointment) =>
      ids.has(appointment.appointmentTypeId) &&
      ACTIVE_STATUSES.includes(appointment.status),
  );
}

/**
 * Applies the administrator's migration choice. Returns how many
 * appointments were cancelled so the caller can report it.
 */
async function applyMigration(
  ctx: MutationCtx,
  args: {
    actor: Doc<"users">;
    affected: Doc<"appointments">[];
    migration: "keepExisting" | "cancelAffected";
    reason: string;
  },
): Promise<number> {
  if (args.migration === "keepExisting") return 0;
  const now = Date.now();
  for (const appointment of args.affected) {
    await ctx.db.patch(appointment._id, {
      status: "cancelled",
      cancellationReason: args.reason,
      cancellationCategory: "practice",
      updatedAt: now,
    });
    // The event row is written here rather than through the appointments
    // module: importing it would close a cycle (appointments → scheduling →
    // administration). The shape is the append-only history contract.
    await ctx.db.insert("appointmentEvents", {
      appointmentId: appointment._id,
      fromStatus: appointment.status,
      toStatus: "cancelled",
      reason: args.reason,
      actorUserId: args.actor._id,
      createdAt: now,
    });
    await writeAudit(ctx, {
      actor: args.actor,
      action: "appointment.cancelled",
      entityType: "appointments",
      entityId: appointment._id,
      reason: args.reason,
    });
    await invalidateAppointmentJobs(ctx, appointment._id);
  }
  return args.affected.length;
}

/**
 * Refuses the change when future appointments depend on the configuration
 * and no migration was chosen. The error names the count so the UI can ask
 * the administrator a specific question.
 */
export async function requireMigrationChoice(
  ctx: MutationCtx,
  args: {
    actor: Doc<"users">;
    appointmentTypeIds: Id<"appointmentTypes">[];
    migration?: "keepExisting" | "cancelAffected";
    reason: string;
  },
): Promise<number> {
  const affected = await futureAppointmentsFor(
    ctx,
    args.appointmentTypeIds,
    Date.now(),
  );
  if (affected.length === 0) return 0;
  if (!args.migration) {
    throw new Error(
      `${affected.length} future appointment(s) use this configuration; choose a migration`,
    );
  }
  return await applyMigration(ctx, {
    actor: args.actor,
    affected,
    migration: args.migration,
    reason: args.reason,
  });
}

// --- Catalog ----------------------------------------------------------

/** Service catalog with dependency counts for the administration screen. */
export const listServiceCatalog = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "config.manage");
    const [services, appointmentTypes] = await Promise.all([
      ctx.db.query("services").collect(),
      ctx.db.query("appointmentTypes").collect(),
    ]);
    return services
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((service) => {
        const types = appointmentTypes.filter(
          (type) => type.serviceId === service._id,
        );
        return {
          ...service,
          appointmentTypeCount: types.length,
          activeAppointmentTypeCount: types.filter(
            (type) => type.status === "active",
          ).length,
        };
      });
  },
});

/**
 * The full configuration graph for one service: appointment types with the
 * reminders, forms, resources, and providers they depend on. Read-only —
 * each linked module keeps its own mutations.
 */
export const getServiceConfiguration = query({
  args: { serviceId: v.id("services") },
  handler: async (ctx, args) => {
    await requireCapability(ctx, "config.manage");
    const service = await ctx.db.get(args.serviceId);
    if (!service) throw new Error("Service not found");

    const appointmentTypes = (await ctx.db.query("appointmentTypes").collect())
      .filter((type) => type.serviceId === service._id)
      .sort((a, b) => a.name.localeCompare(b.name));
    const [formRules, resources] = await Promise.all([
      ctx.db.query("formAssignmentRules").collect(),
      ctx.db.query("resources").collect(),
    ]);

    const types = await Promise.all(
      appointmentTypes.map(async (type) => {
        const [location, schedules, providers] = await Promise.all([
          ctx.db.get(type.locationId),
          ctx.db
            .query("reminderSchedules")
            .withIndex("by_appointment_type", (q) =>
              q.eq("appointmentTypeId", type._id),
            )
            .collect(),
          Promise.all(type.eligibleProviderIds.map((id) => ctx.db.get(id))),
        ]);
        const reminders = await Promise.all(
          schedules.map(async (schedule) => ({
            _id: schedule._id,
            channel: schedule.channel,
            intent: schedule.intent,
            minutesBefore: schedule.minutesBefore,
            active: schedule.active,
            templateName:
              (await ctx.db.get(schedule.templateId))?.name ?? "(removed)",
          })),
        );
        const forms = await Promise.all(
          formRules
            .filter(
              (rule) =>
                rule.active &&
                (rule.appointmentType === type.key ||
                  rule.serviceKey === service.key),
            )
            .map(async (rule) => ({
              _id: rule._id,
              audience: rule.audience,
              templateName:
                (await ctx.db.get(rule.templateId))?.name ?? "(removed)",
            })),
        );
        return {
          ...type,
          locationName: location?.name ?? "(archived)",
          providerNames: providers.map((p) => p?.displayName ?? "(archived)"),
          reminders,
          forms,
          // Required resource types plus how much capacity exists for each.
          resourceRequirements: type.requiredResourceTypes.map(
            (resourceType) => ({
              type: resourceType,
              availableCount: resources.filter(
                (resource) =>
                  resource.type === resourceType &&
                  resource.status === "active" &&
                  resource.locationId === type.locationId,
              ).length,
            }),
          ),
        };
      }),
    );
    return { service, appointmentTypes: types };
  },
});

// --- Service lifecycle -------------------------------------------------

export const updateService = mutation({
  args: {
    serviceId: v.id("services"),
    name: v.string(),
    effectiveFrom: v.optional(v.number()),
    effectiveTo: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "config.manage");
    const service = await ctx.db.get(args.serviceId);
    if (!service) throw new Error("Service not found");
    const name = args.name.trim();
    if (!name) throw new Error("A name is required");
    validateEffectiveWindow(args);
    await ctx.db.patch(service._id, {
      name,
      effectiveFrom: args.effectiveFrom,
      effectiveTo: args.effectiveTo,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "administration.service.updated",
      entityType: "services",
      entityId: service._id,
    });
  },
});

/**
 * Moves a service between active, future, and disabled. Leaving the
 * bookable state with future appointments outstanding requires a migration
 * choice; the count of cancelled appointments is returned.
 */
export const setServiceStatus = mutation({
  args: {
    serviceId: v.id("services"),
    status: serviceStatusValidator,
    reason: v.string(),
    migration: v.optional(migrationValidator),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "config.manage");
    const service = await ctx.db.get(args.serviceId);
    if (!service) throw new Error("Service not found");
    const reason = args.reason.trim();
    if (!reason) throw new Error("A reason is required");

    let cancelled = 0;
    if (service.status === "active" && args.status !== "active") {
      const typeIds = (await ctx.db.query("appointmentTypes").collect())
        .filter((type) => type.serviceId === service._id)
        .map((type) => type._id);
      cancelled = await requireMigrationChoice(ctx, {
        actor,
        appointmentTypeIds: typeIds,
        migration: args.migration,
        reason,
      });
    }

    await ctx.db.patch(service._id, {
      status: args.status,
      statusReason: reason,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: `administration.service.${args.status}`,
      entityType: "services",
      entityId: service._id,
      reason,
    });
    return { cancelledAppointments: cancelled };
  },
});
