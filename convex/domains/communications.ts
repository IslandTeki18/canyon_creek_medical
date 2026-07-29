import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { requireCapability } from "../lib/access";
import { writeAudit } from "../lib/audit";
import {
  APPROVED_TEMPLATE_VARIABLES,
  communicationIdempotencyKey,
  renderNeutralTemplate,
  retryAt,
  validateNeutralTemplate,
  type DeliveryResult,
} from "../lib/communications";
import { buildReadiness } from "../lib/readiness";
import { sendEmail } from "../integrations/resend";
import { sendSms } from "../integrations/twilio";

const channel = v.union(v.literal("sms"), v.literal("email"));
const intent = v.union(
  v.literal("appointmentReminder"),
  v.literal("incompleteIntake"),
);

export const listTemplates = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "communication.manage");
    const templates = await ctx.db.query("messageTemplates").collect();
    return await Promise.all(
      templates.map(async (template) => ({
        ...template,
        versions: await ctx.db
          .query("messageTemplateVersions")
          .withIndex("by_template", (q) => q.eq("templateId", template._id))
          .order("desc")
          .collect(),
      })),
    );
  },
});

export const createTemplate = mutation({
  args: {
    name: v.string(),
    intent: v.string(),
    channel,
    subject: v.optional(v.string()),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "communication.manage");
    if (!args.name.trim() || !args.intent.trim()) {
      throw new Error("Name and intent are required");
    }
    if (args.channel === "sms" && args.subject) {
      throw new Error("SMS templates cannot have a subject");
    }
    validateNeutralTemplate(args.subject, args.body);
    const now = Date.now();
    const templateId = await ctx.db.insert("messageTemplates", {
      name: args.name.trim(),
      intent: args.intent.trim(),
      channel: args.channel,
      status: "active",
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("messageTemplateVersions", {
      templateId,
      version: 1,
      status: "draft",
      subject: args.subject?.trim(),
      body: args.body.trim(),
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "communication.template.created",
      entityType: "messageTemplates",
      entityId: templateId,
    });
    return templateId;
  },
});

export const createDraft = mutation({
  args: { templateId: v.id("messageTemplates") },
  handler: async (ctx, { templateId }) => {
    const actor = await requireCapability(ctx, "communication.manage");
    const template = await ctx.db.get(templateId);
    if (!template) throw new Error("Template not found");
    const latest = await ctx.db
      .query("messageTemplateVersions")
      .withIndex("by_template", (q) => q.eq("templateId", templateId))
      .order("desc")
      .first();
    if (!latest) throw new Error("Template version not found");
    if (latest.status === "draft") throw new Error("A draft already exists");
    const now = Date.now();
    return await ctx.db.insert("messageTemplateVersions", {
      templateId,
      version: latest.version + 1,
      status: "draft",
      subject: latest.subject,
      body: latest.body,
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateDraft = mutation({
  args: {
    versionId: v.id("messageTemplateVersions"),
    subject: v.optional(v.string()),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "communication.manage");
    const version = await ctx.db.get(args.versionId);
    if (!version || version.status !== "draft") {
      throw new Error("Only draft versions can be edited");
    }
    const template = await ctx.db.get(version.templateId);
    if (!template) throw new Error("Template not found");
    if (template.channel === "sms" && args.subject) {
      throw new Error("SMS templates cannot have a subject");
    }
    validateNeutralTemplate(args.subject, args.body);
    await ctx.db.patch(args.versionId, {
      subject: args.subject?.trim(),
      body: args.body.trim(),
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "communication.template.draft_updated",
      entityType: "messageTemplateVersions",
      entityId: args.versionId,
    });
  },
});

export const publishTemplate = mutation({
  args: { versionId: v.id("messageTemplateVersions") },
  handler: async (ctx, { versionId }) => {
    const actor = await requireCapability(ctx, "communication.manage");
    const version = await ctx.db.get(versionId);
    if (!version || version.status !== "draft") {
      throw new Error("Only draft versions can be published");
    }
    validateNeutralTemplate(version.subject, version.body);
    const current = await ctx.db
      .query("messageTemplateVersions")
      .withIndex("by_template_status", (q) =>
        q.eq("templateId", version.templateId).eq("status", "published"),
      )
      .unique();
    const now = Date.now();
    if (current) {
      await ctx.db.patch(current._id, {
        status: "superseded",
        updatedAt: now,
      });
    }
    await ctx.db.patch(versionId, {
      status: "published",
      publishedAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "communication.template.published",
      entityType: "messageTemplateVersions",
      entityId: versionId,
    });
  },
});

export const previewTemplate = query({
  args: {
    subject: v.optional(v.string()),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, "communication.manage");
    validateNeutralTemplate(args.subject, args.body);
    const values = {
      practiceName: "Canyon Creek",
      practicePhone: "(555) 010-0200",
      appointmentDate: "August 12, 2026",
      appointmentTime: "10:30 AM",
    };
    return {
      subject: args.subject
        ? renderNeutralTemplate(args.subject, values)
        : undefined,
      body: renderNeutralTemplate(args.body, values),
      variables: APPROVED_TEMPLATE_VARIABLES,
    };
  },
});

export const listSchedules = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "communication.manage");
    const schedules = await ctx.db.query("reminderSchedules").collect();
    return await Promise.all(
      schedules.map(async (schedule) => ({
        ...schedule,
        appointmentTypeName:
          (await ctx.db.get(schedule.appointmentTypeId))?.name ?? "(archived)",
        templateName:
          (await ctx.db.get(schedule.templateId))?.name ?? "(retired)",
      })),
    );
  },
});

export const createSchedule = mutation({
  args: {
    appointmentTypeId: v.id("appointmentTypes"),
    templateId: v.id("messageTemplates"),
    channel,
    intent,
    minutesBefore: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "communication.manage");
    const [appointmentType, template] = await Promise.all([
      ctx.db.get(args.appointmentTypeId),
      ctx.db.get(args.templateId),
    ]);
    if (!appointmentType || !template || template.status !== "active") {
      throw new Error("Appointment type or template not found");
    }
    if (template.channel !== args.channel) {
      throw new Error("Schedule channel must match the template");
    }
    if (!Number.isInteger(args.minutesBefore) || args.minutesBefore < 0) {
      throw new Error("Minutes before must be a non-negative integer");
    }
    const now = Date.now();
    const scheduleId = await ctx.db.insert("reminderSchedules", {
      ...args,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "communication.schedule.created",
      entityType: "reminderSchedules",
      entityId: scheduleId,
    });
    return scheduleId;
  },
});

export const setScheduleActive = mutation({
  args: { scheduleId: v.id("reminderSchedules"), active: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "communication.manage");
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) throw new Error("Schedule not found");
    await ctx.db.patch(args.scheduleId, {
      active: args.active,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "communication.schedule.updated",
      entityType: "reminderSchedules",
      entityId: args.scheduleId,
    });
  },
});

async function isSuppressed(
  ctx: MutationCtx,
  patientId: Id<"patients">,
  selectedChannel: "sms" | "email",
): Promise<boolean> {
  return (
    (await ctx.db
      .query("communicationSuppressions")
      .withIndex("by_patient_channel", (q) =>
        q
          .eq("patientId", patientId)
          .eq("channel", selectedChannel)
          .eq("active", true),
      )
      .first()) !== null
  );
}

export async function enqueueAfterVisitNotification(
  ctx: MutationCtx,
  args: {
    patientId: Id<"patients">;
    appointmentId: Id<"appointments">;
    summaryVersionId: Id<"afterVisitSummaryVersions">;
  },
): Promise<number> {
  const [patient, preference, templates] = await Promise.all([
    ctx.db.get(args.patientId),
    ctx.db
      .query("communicationPreferences")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
      .unique(),
    ctx.db
      .query("messageTemplates")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect(),
  ]);
  if (!patient || !preference) return 0;
  let created = 0;
  for (const template of templates.filter(
    (item) => item.intent === "afterVisitSummaryAvailable",
  )) {
    const optedIn =
      template.channel === "sms" ? preference.smsOptIn : preference.emailOptIn;
    const destination =
      template.channel === "sms" ? patient.phone : patient.email;
    if (
      !optedIn ||
      !destination ||
      (await isSuppressed(ctx, patient._id, template.channel))
    ) {
      continue;
    }
    const version = await ctx.db
      .query("messageTemplateVersions")
      .withIndex("by_template_status", (q) =>
        q.eq("templateId", template._id).eq("status", "published"),
      )
      .unique();
    if (!version) continue;
    const idempotencyKey = communicationIdempotencyKey({
      intent: template.intent,
      patientId: patient._id,
      referenceId: args.summaryVersionId,
      channel: template.channel,
      schedulePoint: 0,
    });
    if (
      await ctx.db
        .query("communicationJobs")
        .withIndex("by_idempotency_key", (q) =>
          q.eq("idempotencyKey", idempotencyKey),
        )
        .unique()
    ) {
      continue;
    }
    const now = Date.now();
    await ctx.db.insert("communicationJobs", {
      patientId: patient._id,
      appointmentId: args.appointmentId,
      templateVersionId: version._id,
      intent: template.intent,
      channel: template.channel,
      destination,
      scheduledAt: now,
      idempotencyKey,
      status: "pending",
      retryCount: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });
    created++;
  }
  return created;
}

/** Cancels unsent work immediately when an appointment changes. */
export async function invalidateAppointmentJobs(
  ctx: MutationCtx,
  appointmentId: Id<"appointments">,
): Promise<void> {
  const jobs = await ctx.db
    .query("communicationJobs")
    .withIndex("by_appointment", (q) => q.eq("appointmentId", appointmentId))
    .collect();
  for (const job of jobs) {
    if (job.status === "pending" || job.status === "processing") {
      await ctx.db.patch(job._id, {
        status: "cancelled",
        updatedAt: Date.now(),
      });
    }
  }
}

export const materializeReminderJobs = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_start", (q) =>
        q.gte("startAt", now).lte("startAt", now + 45 * 24 * 60 * 60_000),
      )
      .collect();
    let created = 0;
    for (const appointment of appointments) {
      if (!["scheduled", "confirmed"].includes(appointment.status)) continue;
      const [patient, preference, schedules] = await Promise.all([
        ctx.db.get(appointment.patientId),
        ctx.db
          .query("communicationPreferences")
          .withIndex("by_patient", (q) =>
            q.eq("patientId", appointment.patientId),
          )
          .unique(),
        ctx.db
          .query("reminderSchedules")
          .withIndex("by_appointment_type", (q) =>
            q
              .eq("appointmentTypeId", appointment.appointmentTypeId)
              .eq("active", true),
          )
          .collect(),
      ]);
      if (!patient || patient.status !== "active" || !preference) continue;
      const readiness = await buildReadiness(ctx, patient);
      for (const schedule of schedules) {
        if (
          (schedule.channel === "sms" && !preference.smsOptIn) ||
          (schedule.channel === "email" && !preference.emailOptIn) ||
          (schedule.intent === "incompleteIntake" && readiness.ready) ||
          (await isSuppressed(ctx, patient._id, schedule.channel))
        ) {
          continue;
        }
        const destination =
          schedule.channel === "sms" ? patient.phone : patient.email;
        if (!destination) continue;
        const version = await ctx.db
          .query("messageTemplateVersions")
          .withIndex("by_template_status", (q) =>
            q.eq("templateId", schedule.templateId).eq("status", "published"),
          )
          .unique();
        if (!version) continue;
        const scheduledAt =
          appointment.startAt - schedule.minutesBefore * 60_000;
        const idempotencyKey = communicationIdempotencyKey({
          intent: schedule.intent,
          patientId: patient._id,
          referenceId: appointment._id,
          channel: schedule.channel,
          schedulePoint: scheduledAt,
        });
        const existing = await ctx.db
          .query("communicationJobs")
          .withIndex("by_idempotency_key", (q) =>
            q.eq("idempotencyKey", idempotencyKey),
          )
          .unique();
        if (existing) continue;
        await ctx.db.insert("communicationJobs", {
          patientId: patient._id,
          appointmentId: appointment._id,
          templateVersionId: version._id,
          intent: schedule.intent,
          channel: schedule.channel,
          destination,
          scheduledAt,
          idempotencyKey,
          status: "pending",
          retryCount: 0,
          nextAttemptAt: Math.max(now, scheduledAt),
          createdAt: now,
          updatedAt: now,
        });
        created++;
      }
    }
    return { created };
  },
});

function appointmentValues(appointment: Doc<"appointments">) {
  const date = new Date(appointment.startAt);
  const options = { timeZone: appointment.timeZone } as const;
  return {
    practiceName: process.env.PRACTICE_NAME ?? "Canyon Creek",
    practicePhone: process.env.PRACTICE_PHONE ?? "the practice",
    appointmentDate: date.toLocaleDateString("en-US", {
      ...options,
      dateStyle: "long",
    }),
    appointmentTime: date.toLocaleTimeString("en-US", {
      ...options,
      timeStyle: "short",
    }),
  };
}

export const claimDueJob = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const job = await ctx.db
      .query("communicationJobs")
      .withIndex("by_due", (q) =>
        q.eq("status", "pending").lte("nextAttemptAt", now),
      )
      .first();
    if (!job) return null;
    const [patient, appointment, version] = await Promise.all([
      ctx.db.get(job.patientId),
      job.appointmentId ? ctx.db.get(job.appointmentId) : null,
      ctx.db.get(job.templateVersionId),
    ]);
    if (
      !patient ||
      !appointment ||
      !version ||
      (!["scheduled", "confirmed"].includes(appointment.status) &&
        job.intent !== "afterVisitSummaryAvailable") ||
      (await isSuppressed(ctx, job.patientId, job.channel))
    ) {
      await ctx.db.patch(job._id, { status: "cancelled", updatedAt: now });
      return null;
    }
    const values = appointmentValues(appointment);
    const attemptNumber = job.retryCount + 1;
    const attemptId = await ctx.db.insert("communicationAttempts", {
      jobId: job._id,
      attemptNumber,
      provider: job.channel === "sms" ? "twilio" : "resend",
      state: "created",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(job._id, {
      status: "processing",
      claimedAt: now,
      updatedAt: now,
    });
    return {
      jobId: job._id,
      attemptId,
      channel: job.channel,
      destination: job.destination,
      body: renderNeutralTemplate(version.body, values),
      subject: version.subject
        ? renderNeutralTemplate(version.subject, values)
        : undefined,
      correlationId: attemptId,
    };
  },
});

export const finalizeAttempt = internalMutation({
  args: {
    jobId: v.id("communicationJobs"),
    attemptId: v.id("communicationAttempts"),
    ok: v.boolean(),
    providerMessageId: v.optional(v.string()),
    category: v.optional(
      v.union(v.literal("transient"), v.literal("permanent")),
    ),
    code: v.optional(v.string()),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const job = await ctx.db.get(args.jobId);
    const attempt = await ctx.db.get(args.attemptId);
    if (!job || !attempt || attempt.state !== "created") return;
    if (args.ok) {
      await ctx.db.patch(args.attemptId, {
        state: "accepted",
        providerMessageId: args.providerMessageId,
        updatedAt: now,
      });
      await ctx.db.patch(args.jobId, {
        status: "sent",
        retryCount: attempt.attemptNumber,
        updatedAt: now,
      });
      return;
    }
    await ctx.db.patch(args.attemptId, {
      state: "failed",
      errorCategory: args.category,
      errorCode: args.code,
      updatedAt: now,
    });
    const next =
      args.category === "transient"
        ? retryAt(now, attempt.attemptNumber)
        : null;
    await ctx.db.patch(args.jobId, {
      status: next === null ? "followUp" : "pending",
      retryCount: attempt.attemptNumber,
      nextAttemptAt: next ?? job.nextAttemptAt,
      updatedAt: now,
    });
  },
});

export const recoverStaleJobs = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const jobs = await ctx.db
      .query("communicationJobs")
      .withIndex("by_due", (q) => q.eq("status", "processing"))
      .take(100);
    let recovered = 0;
    for (const job of jobs) {
      if (!job.claimedAt || job.claimedAt > now - 10 * 60_000) continue;
      const attempt = await ctx.db
        .query("communicationAttempts")
        .withIndex("by_job", (q) => q.eq("jobId", job._id))
        .order("desc")
        .first();
      if (!attempt || attempt.state !== "created") continue;
      await ctx.db.patch(attempt._id, {
        state: "failed",
        errorCategory: "transient",
        errorCode: "worker_timeout",
        updatedAt: now,
      });
      const next = retryAt(now, attempt.attemptNumber);
      await ctx.db.patch(job._id, {
        status: next === null ? "followUp" : "pending",
        retryCount: attempt.attemptNumber,
        nextAttemptAt: next ?? job.nextAttemptAt,
        updatedAt: now,
      });
      recovered++;
    }
    return { recovered };
  },
});

function toHtml(text: string): string {
  const escaped = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  return `<p>${escaped.replaceAll("\n", "<br>")}</p>`;
}

export const processOutboundJobs = internalAction({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(internal.domains.communications.recoverStaleJobs, {});
    let processed = 0;
    while (processed < 25) {
      const claimed = await ctx.runMutation(
        internal.domains.communications.claimDueJob,
        {},
      );
      if (!claimed) break;
      let result: DeliveryResult;
      try {
        result =
          claimed.channel === "sms"
            ? await sendSms({
                to: claimed.destination,
                body: claimed.body,
                callbackUrl: `${process.env.COMMUNICATION_CALLBACK_BASE_URL ?? ""}/twilio-status`,
                correlationId: claimed.correlationId,
              })
            : await sendEmail({
                to: claimed.destination,
                subject: claimed.subject ?? "A message from the practice",
                text: claimed.body,
                html: toHtml(claimed.body),
                correlationId: claimed.correlationId,
              });
      } catch {
        result = { ok: false, category: "transient", code: "network_error" };
      }
      await ctx.runMutation(internal.domains.communications.finalizeAttempt, {
        jobId: claimed.jobId,
        attemptId: claimed.attemptId,
        ...result,
      });
      processed++;
    }
    return { processed };
  },
});

export const applyProviderEvent = internalMutation({
  args: {
    provider: v.union(v.literal("twilio"), v.literal("resend")),
    eventId: v.string(),
    providerMessageId: v.string(),
    state: v.union(
      v.literal("accepted"),
      v.literal("delivered"),
      v.literal("failed"),
    ),
  },
  handler: async (ctx, args) => {
    const replay = await ctx.db
      .query("webhookEvents")
      .withIndex("by_provider_event", (q) =>
        q.eq("provider", args.provider).eq("providerEventId", args.eventId),
      )
      .unique();
    if (replay) return { replay: true, matched: replay.matched };
    const attempt = await ctx.db
      .query("communicationAttempts")
      .withIndex("by_provider_message", (q) =>
        q.eq("providerMessageId", args.providerMessageId),
      )
      .first();
    await ctx.db.insert("webhookEvents", {
      provider: args.provider,
      providerEventId: args.eventId,
      matched: Boolean(attempt),
      createdAt: Date.now(),
    });
    if (!attempt) return { replay: false, matched: false };
    await ctx.db.patch(attempt._id, {
      state: args.state,
      updatedAt: Date.now(),
    });
    const job = await ctx.db.get(attempt.jobId);
    if (job) {
      await ctx.db.patch(job._id, {
        status:
          args.state === "delivered"
            ? "delivered"
            : args.state === "failed"
              ? "followUp"
              : "sent",
        updatedAt: Date.now(),
      });
    }
    return { replay: false, matched: true };
  },
});

export const listPatientHistory = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    await requireCapability(ctx, "patient.read");
    const jobs = await ctx.db
      .query("communicationJobs")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .order("desc")
      .collect();
    return jobs.map((job) => ({
      _id: job._id,
      channel: job.channel,
      intent: job.intent,
      status: job.status,
      scheduledAt: job.scheduledAt,
      updatedAt: job.updatedAt,
    }));
  },
});

export const listFailures = query({
  args: { channel: v.optional(channel) },
  handler: async (ctx, args) => {
    await requireCapability(ctx, "communication.manage");
    const jobs = await ctx.db
      .query("communicationJobs")
      .withIndex("by_due", (q) => q.eq("status", "followUp"))
      .collect();
    const rows = [];
    for (const job of jobs) {
      if (args.channel && job.channel !== args.channel) continue;
      const patient = await ctx.db.get(job.patientId);
      rows.push({
        _id: job._id,
        patientId: job.patientId,
        patientName: patient
          ? `${patient.legalLastName}, ${patient.legalFirstName}`
          : "(unknown)",
        channel: job.channel,
        intent: job.intent,
        retryCount: job.retryCount,
        updatedAt: job.updatedAt,
      });
    }
    return rows;
  },
});

export const retryFailure = mutation({
  args: { jobId: v.id("communicationJobs"), reason: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "communication.manage");
    if (!args.reason.trim()) throw new Error("A reason is required");
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "followUp") throw new Error("Failure not found");
    const preference = await ctx.db
      .query("communicationPreferences")
      .withIndex("by_patient", (q) => q.eq("patientId", job.patientId))
      .unique();
    const optedIn =
      job.channel === "sms" ? preference?.smsOptIn : preference?.emailOptIn;
    if (!optedIn || (await isSuppressed(ctx, job.patientId, job.channel))) {
      throw new Error("Patient has opted out or is suppressed");
    }
    await ctx.db.patch(job._id, {
      status: "pending",
      retryCount: 0,
      nextAttemptAt: Date.now(),
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "communication.manual_resend",
      entityType: "communicationJobs",
      entityId: job._id,
      reason: args.reason,
    });
  },
});

export const resolveFailure = mutation({
  args: { jobId: v.id("communicationJobs"), reason: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "communication.manage");
    if (!args.reason.trim()) throw new Error("A reason is required");
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "followUp") throw new Error("Failure not found");
    await ctx.db.patch(job._id, {
      status: "resolved",
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "communication.follow_up_resolved",
      entityType: "communicationJobs",
      entityId: job._id,
      reason: args.reason,
    });
  },
});

export const updatePreference = mutation({
  args: {
    patientId: v.id("patients"),
    smsOptIn: v.boolean(),
    emailOptIn: v.boolean(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "communication.manage");
    if (!args.reason.trim()) throw new Error("A reason is required");
    const preference = await ctx.db
      .query("communicationPreferences")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
      .unique();
    if (!preference) throw new Error("Preferences not found");
    await ctx.db.patch(preference._id, {
      smsOptIn: args.smsOptIn,
      emailOptIn: args.emailOptIn,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "communication.preference_updated",
      entityType: "patients",
      entityId: args.patientId,
      reason: args.reason,
    });
  },
});
