// Unified patient timeline (Increment 11.5). One chronological index over
// appointments, forms, encounters, clinical-list changes, documents,
// communications, and tasks. Entries are summaries and deep links — never
// copies of the underlying record — and every event type is filtered
// server-side by what the viewer may see, so a denied type is simply absent
// from the response rather than hidden by the client.
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { requireCapability, requireLinkedPatient } from "../lib/access";
import {
  hasCapability,
  isCapability,
  type Capability,
} from "../lib/permissions";
import { canAccessDocument } from "./documents";

export const TIMELINE_TYPES = [
  "appointment",
  "form",
  "encounter",
  "medication",
  "document",
  "communication",
  "task",
  "afterVisitSummary",
] as const;
export type TimelineType = (typeof TIMELINE_TYPES)[number];

export interface TimelineEntry {
  type: TimelineType;
  id: string;
  at: number;
  summary: string;
  link: string | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Which capability a workforce viewer needs for each event type. */
const REQUIRED: Record<TimelineType, Capability> = {
  appointment: "patient.read",
  form: "patient.read",
  encounter: "encounter.read",
  medication: "clinical.manage",
  document: "patient.read",
  communication: "communication.manage",
  task: "patient.read",
  afterVisitSummary: "encounter.read",
};

async function collect(
  ctx: QueryCtx,
  args: {
    patientId: Id<"patients">;
    viewer: Doc<"users"> | null; // null for a portal patient
    allowed: ReadonlySet<TimelineType>;
  },
): Promise<TimelineEntry[]> {
  const { patientId, allowed } = args;
  const entries: TimelineEntry[] = [];

  if (allowed.has("appointment")) {
    for (const appointment of await ctx.db
      .query("appointments")
      .withIndex("by_patient_start", (q) => q.eq("patientId", patientId))
      .collect()) {
      entries.push({
        type: "appointment",
        id: appointment._id,
        at: appointment.startAt,
        summary: `Appointment — ${appointment.status}`,
        link: args.viewer ? `/app/appointments/${appointment._id}` : null,
      });
    }
  }

  if (allowed.has("form")) {
    for (const response of await ctx.db
      .query("formResponses")
      .withIndex("by_patient", (q) =>
        q.eq("patientId", patientId).eq("status", "submitted"),
      )
      .collect()) {
      const template = await ctx.db.get(response.templateId);
      entries.push({
        type: "form",
        id: response._id,
        at: response.submittedAt ?? response.updatedAt,
        summary: `Form submitted — ${template?.name ?? "form"}`,
        link: args.viewer ? null : `/portal/forms/${response._id}`,
      });
    }
  }

  if (allowed.has("encounter")) {
    for (const encounter of await ctx.db
      .query("encounters")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .collect()) {
      entries.push({
        type: "encounter",
        id: encounter._id,
        at: encounter.startedAt,
        summary: `Encounter — ${encounter.status}`,
        link: `/app/encounters/${encounter._id}`,
      });
    }
  }

  if (allowed.has("afterVisitSummary")) {
    for (const summary of await ctx.db
      .query("afterVisitSummaries")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .collect()) {
      const versions = await ctx.db
        .query("afterVisitSummaryVersions")
        .withIndex("by_summary_status", (q) =>
          q.eq("summaryId", summary._id).eq("status", "published"),
        )
        .collect();
      for (const version of versions) {
        entries.push({
          type: "afterVisitSummary",
          id: version._id,
          at: version.publishedAt ?? version.updatedAt,
          summary: "After-visit summary published",
          link: args.viewer
            ? `/app/encounters/${summary.encounterId}`
            : "/portal/health-record",
        });
      }
    }
  }

  if (allowed.has("medication")) {
    for (const medication of await ctx.db
      .query("medications")
      .withIndex("by_patient_status", (q) => q.eq("patientId", patientId))
      .collect()) {
      entries.push({
        type: "medication",
        id: medication._id,
        at: medication.updatedAt,
        // Neutral: the entry points at the list, it does not restate it.
        summary: `Medication list updated (${medication.reconciliationStatus})`,
        link: null,
      });
    }
  }

  if (allowed.has("document")) {
    for (const document of await ctx.db
      .query("documents")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .collect()) {
      if (document.archivedAt) continue;
      if (
        args.viewer &&
        !(await canAccessDocument(ctx, args.viewer, document))
      ) {
        continue;
      }
      if (!args.viewer && document.visibility !== "patient") continue;
      entries.push({
        type: "document",
        id: document._id,
        at: document.createdAt,
        summary: `Document — ${document.category} (${document.reviewStatus})`,
        link: args.viewer ? null : "/portal/documents",
      });
    }
  }

  if (allowed.has("communication")) {
    for (const job of await ctx.db
      .query("communicationJobs")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .collect()) {
      entries.push({
        type: "communication",
        id: job._id,
        at: job.createdAt,
        // Channel, intent, and state only — never the message body.
        summary: `Message — ${job.channel} ${job.intent} (${job.status})`,
        link: null,
      });
    }
  }

  if (allowed.has("task") && args.viewer) {
    const queues = await ctx.db.query("taskQueues").collect();
    const accessible = new Set(
      queues
        .filter(
          (queue) =>
            queue.active &&
            isCapability(queue.requiredCapability) &&
            hasCapability(args.viewer!.roles, queue.requiredCapability),
        )
        .map((queue) => queue.key),
    );
    for (const status of [
      "open",
      "inProgress",
      "blocked",
      "completed",
    ] as const) {
      for (const task of await ctx.db
        .query("tasks")
        .withIndex("by_patient", (q) =>
          q.eq("patientId", patientId).eq("status", status),
        )
        .collect()) {
        if (!accessible.has(task.queueKey)) continue;
        entries.push({
          type: "task",
          id: task._id,
          at: task.createdAt,
          summary: `Task — ${task.title} (${task.status})`,
          link: "/app/tasks",
        });
      }
    }
  }

  return entries;
}

function paginate(
  entries: TimelineEntry[],
  args: { types?: string[]; before?: number; limit?: number },
): { entries: TimelineEntry[]; nextBefore: number | null } {
  const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const filtered = entries
    .filter((entry) => !args.types || args.types.includes(entry.type))
    .filter((entry) => args.before === undefined || entry.at < args.before)
    .sort((a, b) => b.at - a.at);
  const page = filtered.slice(0, limit);
  return {
    entries: page,
    nextBefore:
      filtered.length > page.length ? (page.at(-1)?.at ?? null) : null,
  };
}

/** Staff timeline. Event types the viewer may not see are never collected. */
export const listForPatient = query({
  args: {
    patientId: v.id("patients"),
    types: v.optional(v.array(v.string())),
    before: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireCapability(ctx, "patient.read");
    const allowed = new Set(
      TIMELINE_TYPES.filter((type) =>
        hasCapability(viewer.roles, REQUIRED[type]),
      ),
    );
    return paginate(
      await collect(ctx, { patientId: args.patientId, viewer, allowed }),
      args,
    );
  },
});

/** Portal timeline: the caller's own record, patient-appropriate types. */
export const myTimeline = query({
  args: {
    types: v.optional(v.array(v.string())),
    before: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { patient } = await requireLinkedPatient(ctx);
    // A patient sees their own operational record and approved summaries —
    // never encounters, clinical lists, staff tasks, or message plumbing.
    const allowed = new Set<TimelineType>([
      "appointment",
      "form",
      "document",
      "afterVisitSummary",
    ]);
    return paginate(
      await collect(ctx, { patientId: patient._id, viewer: null, allowed }),
      args,
    );
  },
});
