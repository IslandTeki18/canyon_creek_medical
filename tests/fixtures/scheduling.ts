// Synthetic scheduling fixtures — never real data.
import type { convexTest } from "convex-test";
import type { Id } from "../../convex/_generated/dataModel";

export const TZ = "America/Denver";

export interface SchedulingWorld {
  locationId: Id<"locations">;
  providerId: Id<"providers">;
  serviceId: Id<"services">;
  appointmentTypeId: Id<"appointmentTypes">;
  providerUserId: Id<"users">;
}

/**
 * A location, one bookable provider, a service, and an appointment type with
 * Monday–Friday 09:00–17:00 local availability.
 */
export async function seedSchedulingWorld(
  tx: ReturnType<typeof convexTest>,
  options: {
    durationMinutes?: number;
    bufferAfterMinutes?: number;
    timeZone?: string;
  } = {},
): Promise<SchedulingWorld> {
  const {
    durationMinutes = 60,
    bufferAfterMinutes = 0,
    timeZone = TZ,
  } = options;
  return await tx.run(async (ctx) => {
    const now = 0;
    const locationId = await ctx.db.insert("locations", {
      name: "Main Clinic",
      timeZone,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const providerUserId = await ctx.db.insert("users", {
      clerkUserId: "user_fixture_provider",
      type: "workforce",
      status: "active",
      roles: ["provider"],
      displayName: "Dr. Synthetic",
      createdAt: now,
      updatedAt: now,
    });
    const providerId = await ctx.db.insert("providers", {
      userId: providerUserId,
      displayName: "Dr. Synthetic",
      defaultLocationId: locationId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const serviceId = await ctx.db.insert("services", {
      key: "general",
      name: "General Care",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const appointmentTypeId = await ctx.db.insert("appointmentTypes", {
      serviceId,
      key: "followUp",
      name: "Follow-up",
      durationMinutes,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes,
      locationId,
      eligibleProviderIds: [providerId],
      requiredResourceTypes: [],
      patientSelfSchedulable: false,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    for (const weekday of [1, 2, 3, 4, 5]) {
      await ctx.db.insert("availabilityRules", {
        providerId,
        locationId,
        weekday,
        startMinute: 9 * 60,
        endMinute: 17 * 60,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    return {
      locationId,
      providerId,
      serviceId,
      appointmentTypeId,
      providerUserId,
    };
  });
}
