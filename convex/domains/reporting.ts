// Operational dashboard (Increment 12.3). Aggregate counts only: every
// metric is a number plus the queue that explains it. Nothing here returns a
// patient record, a name, or clinical detail — the dashboard tells an
// administrator where to look, and the linked queue enforces its own
// authorization when they get there.
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { requireCapability } from "../lib/access";
import { buildReadiness } from "../lib/readiness";
import { isIsoDate, zonedParts, zonedTimeToUtc } from "../lib/time";
import { writeAudit } from "../lib/audit";
import {
  daysBetween,
  exportFileName,
  isReportKey,
  MAX_RANGE_DAYS,
  MAX_ROWS,
  toCsv,
  type ReportKey,
  type ReportResult,
  type ReportRow,
} from "../lib/reports";

export interface DashboardMetric {
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

    const metrics: DashboardMetric[] = [
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

// --- Outcome and utilization reports (12.4) ---------------------------
// Every report aggregates into labelled buckets. Patient identifiers never
// reach a row, so an export carries process measures rather than a chart
// extract. These are utilization and completion measures — they describe
// what the practice did, never why a patient improved.

interface ReportArgs {
  key: ReportKey;
  from: string;
  to: string;
  serviceKey?: string;
}

function bump(rows: Map<string, ReportRow>, bucket: string, column: string) {
  const row = rows.get(bucket) ?? { bucket, metrics: {} };
  row.metrics[column] = (row.metrics[column] ?? 0) + 1;
  rows.set(bucket, row);
}

/** Appointments in range, honoring the optional service filter. */
async function appointmentsInRange(
  ctx: QueryCtx,
  args: ReportArgs,
): Promise<{ appointment: Doc<"appointments">; date: string }[]> {
  const start = Date.parse(`${args.from}T00:00:00Z`) - 24 * 60 * 60 * 1000;
  const end = Date.parse(`${args.to}T00:00:00Z`) + 48 * 60 * 60 * 1000;
  const rows = await ctx.db
    .query("appointments")
    .withIndex("by_start", (q) => q.gte("startAt", start).lt("startAt", end))
    .collect();

  let allowedTypeIds: Set<string> | null = null;
  if (args.serviceKey) {
    const service = await ctx.db
      .query("services")
      .withIndex("by_key", (q) => q.eq("key", args.serviceKey!))
      .unique();
    if (!service) throw new Error("Unknown service key");
    allowedTypeIds = new Set(
      (await ctx.db.query("appointmentTypes").collect())
        .filter((type) => type.serviceId === service._id)
        .map((type) => type._id),
    );
  }

  return rows
    .map((appointment) => ({
      appointment,
      date: zonedParts(appointment.startAt, appointment.timeZone).date,
    }))
    .filter(
      ({ appointment, date }) =>
        date >= args.from &&
        date <= args.to &&
        (allowedTypeIds === null ||
          allowedTypeIds.has(appointment.appointmentTypeId)),
    );
}

async function buildReport(
  ctx: QueryCtx,
  args: ReportArgs,
): Promise<ReportResult> {
  const rows = new Map<string, ReportRow>();
  let columns: string[] = [];

  switch (args.key) {
    case "appointmentOutcomes": {
      columns = ["scheduled", "completed", "cancelled", "noShow", "total"];
      for (const { appointment, date } of await appointmentsInRange(
        ctx,
        args,
      )) {
        bump(rows, date, "total");
        if (appointment.status === "completed") bump(rows, date, "completed");
        else if (appointment.status === "cancelled")
          bump(rows, date, "cancelled");
        else if (appointment.status === "noShow") bump(rows, date, "noShow");
        else bump(rows, date, "scheduled");
      }
      break;
    }
    case "serviceUtilization": {
      columns = ["booked", "completed", "noShow"];
      const types = new Map(
        (await ctx.db.query("appointmentTypes").collect()).map((type) => [
          type._id,
          type.name,
        ]),
      );
      for (const { appointment } of await appointmentsInRange(ctx, args)) {
        const bucket = types.get(appointment.appointmentTypeId) ?? "(archived)";
        bump(rows, bucket, "booked");
        if (appointment.status === "completed") bump(rows, bucket, "completed");
        if (appointment.status === "noShow") bump(rows, bucket, "noShow");
      }
      break;
    }
    case "intakeCompletion": {
      columns = ["assigned", "completed", "waived"];
      const assignments = await ctx.db.query("formAssignments").collect();
      const templates = new Map(
        (await ctx.db.query("formTemplates").collect()).map((template) => [
          template._id,
          template.name,
        ]),
      );
      const responses = await ctx.db.query("formResponses").collect();
      for (const assignment of assignments) {
        const date = new Date(assignment.createdAt).toISOString().slice(0, 10);
        if (date < args.from || date > args.to) continue;
        const bucket = templates.get(assignment.templateId) ?? "(retired)";
        bump(rows, bucket, "assigned");
        if (assignment.status === "waived") bump(rows, bucket, "waived");
        else if (
          responses.some(
            (response) =>
              response.patientId === assignment.patientId &&
              response.templateId === assignment.templateId &&
              response.status === "submitted",
          )
        ) {
          bump(rows, bucket, "completed");
        }
      }
      break;
    }
    case "assessmentCompletion": {
      columns = ["assigned", "completed"];
      const definitions = new Map(
        (await ctx.db.query("assessmentDefinitions").collect()).map((item) => [
          item._id,
          item.name,
        ]),
      );
      for (const assignment of await ctx.db
        .query("assessmentAssignments")
        .collect()) {
        const date = new Date(assignment.createdAt).toISOString().slice(0, 10);
        if (date < args.from || date > args.to) continue;
        const bucket =
          definitions.get(assignment.assessmentDefinitionId) ?? "(retired)";
        bump(rows, bucket, "assigned");
        if (assignment.status === "completed") bump(rows, bucket, "completed");
      }
      break;
    }
    case "reminderDelivery": {
      columns = ["sent", "delivered", "failed", "cancelled", "total"];
      for (const job of await ctx.db.query("communicationJobs").collect()) {
        const date = new Date(job.createdAt).toISOString().slice(0, 10);
        if (date < args.from || date > args.to) continue;
        const bucket = `${job.intent} (${job.channel})`;
        bump(rows, bucket, "total");
        if (job.status === "delivered") bump(rows, bucket, "delivered");
        else if (job.status === "sent") bump(rows, bucket, "sent");
        else if (job.status === "failed" || job.status === "followUp")
          bump(rows, bucket, "failed");
        else if (job.status === "cancelled") bump(rows, bucket, "cancelled");
      }
      break;
    }
  }

  const sorted = [...rows.values()].sort((a, b) =>
    a.bucket.localeCompare(b.bucket),
  );
  return {
    key: args.key,
    from: args.from,
    to: args.to,
    columns,
    rows: sorted.slice(0, MAX_ROWS),
    truncated: sorted.length > MAX_ROWS,
  };
}

function validateReportArgs(args: {
  report: string;
  from: string;
  to: string;
}): ReportKey {
  if (!isReportKey(args.report)) throw new Error("Unknown report");
  if (!isIsoDate(args.from) || !isIsoDate(args.to)) {
    throw new Error("Dates must be YYYY-MM-DD");
  }
  if (args.to < args.from) throw new Error("The range ends before it starts");
  if (daysBetween(args.from, args.to) > MAX_RANGE_DAYS) {
    throw new Error(`The range cannot exceed ${MAX_RANGE_DAYS} days`);
  }
  return args.report;
}

export const runReport = query({
  args: {
    report: v.string(),
    from: v.string(),
    to: v.string(),
    serviceKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, "report.view");
    const key = validateReportArgs(args);
    return await buildReport(ctx, { ...args, key });
  },
});

/**
 * Exports a report as CSV. Separate capability from viewing, because the
 * data leaves the system: the audit event records who, what scope, and why.
 */
export const exportReport = mutation({
  args: {
    report: v.string(),
    from: v.string(),
    to: v.string(),
    serviceKey: v.optional(v.string()),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "report.export");
    const key = validateReportArgs(args);
    const reason = args.reason.trim();
    if (!reason) throw new Error("A reason is required");
    const result = await buildReport(ctx, { ...args, key });
    const fileName = exportFileName(result);
    await writeAudit(ctx, {
      actor,
      action: "report.exported",
      entityType: "reports",
      entityId: key,
      // Scope and reason, never the data itself.
      reason: `${reason} | scope=${args.from}..${args.to}${
        args.serviceKey ? ` service=${args.serviceKey}` : ""
      } rows=${result.rows.length}`,
    });
    return {
      fileName,
      csv: toCsv(result),
      rowCount: result.rows.length,
      truncated: result.truncated,
    };
  },
});
