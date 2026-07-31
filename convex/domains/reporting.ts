// Operational dashboard (Increment 12.3). Aggregate counts only: every
// metric is a number plus the queue that explains it. Nothing here returns a
// patient record, a name, or clinical detail — the dashboard tells an
// administrator where to look, and the linked queue enforces its own
// authorization when they get there.
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { requireCapability } from "../lib/access";
import { buildReadiness } from "../lib/readiness";
import { isIsoDate, zonedParts, zonedTimeToUtc } from "../lib/time";

export interface Metric {
  key: string;
  label: string;
  count: number;
  link: string | null;
}

/** Appointments for one local day, after location/provider filters. */
async function appointmentsForDay(
  ctx: QueryCtx,
  args: {
    date: string;
    timeZone: string;
    locationId?: Id<"locations">;
    providerId?: Id<"providers">;
  },
): Promise<Doc<"appointments">[]> {
  const start = zonedTimeToUtc(args.date, 0, args.timeZone);
  if (start === null) throw new Error("Date must be YYYY-MM-DD");
  // A local day is not always 24 hours: read a generous window and filter by
  // the local date so DST transitions cannot drop or duplicate a day.
  const window = await ctx.db
    .query("appointments")
    .withIndex("by_start", (q) =>
      q
        .gte("startAt", start - 6 * 60 * 60 * 1000)
        .lt("startAt", start + 30 * 60 * 60 * 1000),
    )
    .collect();
  return window.filter((appointment) => {
    if (
      zonedParts(appointment.startAt, appointment.timeZone).date !== args.date
    )
      return false;
    if (args.locationId && appointment.locationId !== args.locationId)
      return false;
    if (args.providerId && appointment.providerId !== args.providerId)
      return false;
    return true;
  });
}

/**
 * Daily management summary. Defaults to today in the first active
 * location's time zone.
 */
export const operationalDashboard = query({
  args: {
    date: v.optional(v.string()),
    locationId: v.optional(v.id("locations")),
    providerId: v.optional(v.id("providers")),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, "report.view");
    if (args.date !== undefined && !isIsoDate(args.date)) {
      throw new Error("Date must be YYYY-MM-DD");
    }
    const location = args.locationId
      ? await ctx.db.get(args.locationId)
      : await ctx.db
          .query("locations")
          .withIndex("by_status", (q) => q.eq("status", "active"))
          .first();
    const timeZone = location?.timeZone ?? "UTC";
    const date = args.date ?? zonedParts(Date.now(), timeZone).date;

    const appointments = await appointmentsForDay(ctx, {
      date,
      timeZone,
      locationId: args.locationId,
      providerId: args.providerId,
    });

    const byStatus = (status: Doc<"appointments">["status"]) =>
      appointments.filter((appointment) => appointment.status === status)
        .length;

    // Readiness is computed only for the day's patients, so the cost is
    // bounded by the schedule rather than by the size of the registry.
    const patientIds = [...new Set(appointments.map((a) => a.patientId))];
    let notReady = 0;
    let incompleteIntake = 0;
    for (const patientId of patientIds) {
      const patient = await ctx.db.get(patientId);
      if (!patient) continue;
      const readiness = await buildReadiness(ctx, patient);
      if (!readiness.ready) notReady++;
      if (
        readiness.items.some((item) => item.kind === "form" && !item.satisfied)
      ) {
        incompleteIntake++;
      }
    }

    const [failed, followUp, tasks, pendingDocuments] = await Promise.all([
      ctx.db
        .query("communicationJobs")
        .withIndex("by_due", (q) => q.eq("status", "failed"))
        .collect(),
      ctx.db
        .query("communicationJobs")
        .withIndex("by_due", (q) => q.eq("status", "followUp"))
        .collect(),
      ctx.db.query("tasks").collect(),
      ctx.db
        .query("documents")
        .withIndex("by_review_status", (q) => q.eq("reviewStatus", "pending"))
        .collect(),
    ]);

    const unresolvedTasks = tasks.filter((task) =>
      ["open", "inProgress", "blocked"].includes(task.status),
    ).length;

    const metrics: Metric[] = [
      {
        key: "appointments",
        label: "Appointments",
        count: appointments.length,
        link: "/app/schedule",
      },
      {
        key: "unconfirmed",
        label: "Unconfirmed",
        count: byStatus("scheduled"),
        link: "/app/schedule",
      },
      {
        key: "notReady",
        label: "Patients not ready",
        count: notReady,
        link: "/app/schedule",
      },
      {
        key: "incompleteIntake",
        label: "Incomplete intake",
        count: incompleteIntake,
        link: "/app/schedule",
      },
      {
        key: "noShows",
        label: "No-shows",
        count: byStatus("noShow"),
        link: "/app/schedule",
      },
      {
        key: "completed",
        label: "Completed",
        count: byStatus("completed"),
        link: "/app/schedule",
      },
      {
        key: "failedCommunications",
        label: "Failed messages",
        count: failed.length + followUp.length,
        link: "/app/communications/failures",
      },
      {
        key: "unresolvedTasks",
        label: "Unresolved tasks",
        count: unresolvedTasks,
        link: "/app/tasks",
      },
      {
        key: "pendingDocuments",
        label: "Documents awaiting review",
        count: pendingDocuments.length,
        link: "/app/documents/review",
      },
    ];

    return {
      date,
      timeZone,
      locationName: location?.name ?? null,
      // Convex queries are reactive: these counts update as the underlying
      // records change, so there is no staleness window to display.
      generatedAt: Date.now(),
      metrics,
    };
  },
});
