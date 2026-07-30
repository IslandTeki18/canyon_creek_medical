// Ketamine operational workflow (Increment 10). Reads and writes require
// "clinical.manage"; clearance and overrides additionally require
// "encounter.sign". The software enforces operational hard stops only —
// screening, eligibility, and treatment decisions belong to clinicians.
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { requireCapability, requireLinkedPatient } from "../lib/access";
import { writeAudit } from "../lib/audit";
import { formatLocalTime, zonedParts } from "../lib/time";
import { materializeAssignments } from "./assignments";

export type CourseState = Doc<"ketamineCourses">["state"];
export type SessionState = Doc<"ketamineSessions">["state"];

const COURSE_TRANSITIONS: Record<CourseState, readonly CourseState[]> = {
  screening: ["active", "archived"],
  active: ["completed", "archived"],
  completed: ["archived"],
  archived: [],
};

export const SESSION_TRANSITIONS: Record<
  SessionState,
  readonly SessionState[]
> = {
  planned: ["ready", "cancelled"],
  ready: ["planned", "inProgress", "cancelled"],
  inProgress: ["recovery"],
  recovery: ["completed"],
  completed: [],
  cancelled: [],
};

export function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A reason is required");
  return trimmed;
}

export const createCourse = mutation({
  args: {
    patientId: v.id("patients"),
    approvingProviderId: v.id("providers"),
    appointmentTypeId: v.optional(v.id("appointmentTypes")),
    treatmentPlanId: v.optional(v.id("treatmentPlans")),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.status !== "active") {
      throw new Error("Patient not found");
    }
    const provider = await ctx.db.get(args.approvingProviderId);
    if (!provider || provider.status !== "active") {
      throw new Error("Provider not found");
    }
    if (args.treatmentPlanId) {
      const plan = await ctx.db.get(args.treatmentPlanId);
      if (!plan || plan.patientId !== args.patientId) {
        throw new Error("Treatment plan does not belong to this patient");
      }
    }
    const existing = await ctx.db
      .query("ketamineCourses")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
      .collect();
    if (existing.some((c) => c.state === "screening" || c.state === "active")) {
      throw new Error("Patient already has an open ketamine course");
    }
    const now = Date.now();
    const courseId = await ctx.db.insert("ketamineCourses", {
      patientId: args.patientId,
      approvingProviderId: args.approvingProviderId,
      appointmentTypeId: args.appointmentTypeId,
      treatmentPlanId: args.treatmentPlanId,
      state: "screening",
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "ketamine.course.created",
      entityType: "ketamineCourses",
      entityId: courseId,
    });
    return courseId;
  },
});

export const setCourseState = mutation({
  args: {
    courseId: v.id("ketamineCourses"),
    state: v.union(
      v.literal("screening"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("archived"),
    ),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Course not found");
    if (!COURSE_TRANSITIONS[course.state].includes(args.state)) {
      throw new Error(
        `Cannot move course from ${course.state} to ${args.state}`,
      );
    }
    // Hard stop: activation requires a clinician clearance approval (10.2).
    if (args.state === "active") {
      const latest = await latestClearance(ctx, course._id);
      if (latest?.decision !== "approved") {
        throw new Error("A clinician clearance approval is required");
      }
    }
    const reason = requireReason(args.reason);
    await ctx.db.patch(course._id, {
      state: args.state,
      stateReason: reason,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: `ketamine.course.${args.state}`,
      entityType: "ketamineCourses",
      entityId: course._id,
      reason,
    });
  },
});

/** Most recent clearance decision for a course, or null. */
export async function latestClearance(
  ctx: QueryCtx | MutationCtx,
  courseId: Id<"ketamineCourses">,
): Promise<Doc<"ketamineClearanceReviews"> | null> {
  return await ctx.db
    .query("ketamineClearanceReviews")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .order("desc")
    .first();
}

// --- 10.2 Screening and clearance workflow ----------------------------

/** Applied when no active protocol items of a kind are configured. */
export const DEFAULT_PREREQUISITES = [
  { key: "consent", label: "Signed ketamine consent on file" },
  { key: "baselineData", label: "Baseline data collected" },
  { key: "escort", label: "Escort or transportation confirmed" },
] as const;

export const setProtocolItem = mutation({
  args: {
    kind: v.union(
      v.literal("prerequisite"),
      v.literal("checklist"),
      v.literal("dischargeCriteria"),
    ),
    key: v.string(),
    label: v.string(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "config.manage");
    const key = args.key.trim();
    const label = args.label.trim();
    if (!key || !label) throw new Error("Key and label are required");
    const now = Date.now();
    const existing = (
      await ctx.db
        .query("ketamineProtocolItems")
        .withIndex("by_kind", (q) => q.eq("kind", args.kind))
        .collect()
    ).find((item) => item.key === key);
    const itemId = existing
      ? (await ctx.db.patch(existing._id, {
          label,
          active: args.active,
          updatedAt: now,
        }),
        existing._id)
      : await ctx.db.insert("ketamineProtocolItems", {
          kind: args.kind,
          key,
          label,
          active: args.active,
          createdByUserId: actor._id,
          createdAt: now,
          updatedAt: now,
        });
    await writeAudit(ctx, {
      actor,
      action: "ketamine.protocol_item.set",
      entityType: "ketamineProtocolItems",
      entityId: itemId,
    });
    return itemId;
  },
});

/** Active protocol items of a kind, with defaults for prerequisites. */
export async function protocolItems(
  ctx: QueryCtx | MutationCtx,
  kind: Doc<"ketamineProtocolItems">["kind"],
): Promise<{ key: string; label: string }[]> {
  const configured = await ctx.db
    .query("ketamineProtocolItems")
    .withIndex("by_kind", (q) => q.eq("kind", kind).eq("active", true))
    .collect();
  if (configured.length > 0) {
    return configured.map(({ key, label }) => ({ key, label }));
  }
  return kind === "prerequisite" ? [...DEFAULT_PREREQUISITES] : [];
}

/**
 * Assigns ketamine screening/consent forms through the standard rule engine
 * (idempotent). Which templates apply is configuration on
 * formAssignmentRules with serviceKey "ketamine" — no code change per form.
 */
export const assignScreeningForms = mutation({
  args: { courseId: v.id("ketamineCourses") },
  handler: async (ctx, { courseId }) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const course = await ctx.db.get(courseId);
    if (!course) throw new Error("Course not found");
    return await materializeAssignments(ctx, {
      actor,
      patientId: course.patientId,
      serviceKey: "ketamine",
    });
  },
});

export const recordClearance = mutation({
  args: {
    courseId: v.id("ketamineCourses"),
    decision: v.union(
      v.literal("approved"),
      v.literal("deferred"),
      v.literal("declined"),
    ),
    rationale: v.string(),
  },
  handler: async (ctx, args) => {
    // Clearance is a clinician decision: sign capability required.
    const actor = await requireCapability(ctx, "encounter.sign");
    await requireCapability(ctx, "clinical.manage");
    const course = await ctx.db.get(args.courseId);
    if (!course || course.state === "archived") {
      throw new Error("Course not found");
    }
    const rationale = requireReason(args.rationale);
    const reviewId = await ctx.db.insert("ketamineClearanceReviews", {
      courseId: course._id,
      decision: args.decision,
      rationale,
      reviewerUserId: actor._id,
      createdAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: `ketamine.clearance.${args.decision}`,
      entityType: "ketamineClearanceReviews",
      entityId: reviewId,
      reason: rationale,
    });
    return reviewId;
  },
});

export const markPrerequisiteSatisfied = mutation({
  args: { courseId: v.id("ketamineCourses"), key: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Course not found");
    const known = await protocolItems(ctx, "prerequisite");
    if (!known.some((item) => item.key === args.key)) {
      throw new Error(`Unknown prerequisite: ${args.key}`);
    }
    const existing = await ctx.db
      .query("ketamineCoursePrerequisites")
      .withIndex("by_course", (q) =>
        q.eq("courseId", args.courseId).eq("key", args.key),
      )
      .unique();
    if (existing) return existing._id;
    const rowId = await ctx.db.insert("ketamineCoursePrerequisites", {
      courseId: args.courseId,
      key: args.key,
      satisfiedByUserId: actor._id,
      satisfiedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "ketamine.prerequisite.satisfied",
      entityType: "ketamineCoursePrerequisites",
      entityId: rowId,
      reason: args.key,
    });
    return rowId;
  },
});

export interface CourseReadiness {
  clearanceApproved: boolean;
  items: { key: string; label: string; satisfied: boolean }[];
  ready: boolean;
}

/** Explains exactly what blocks a course; never decides eligibility. */
export async function buildCourseReadiness(
  ctx: QueryCtx | MutationCtx,
  courseId: Id<"ketamineCourses">,
): Promise<CourseReadiness> {
  const [clearance, required, satisfied] = await Promise.all([
    latestClearance(ctx, courseId),
    protocolItems(ctx, "prerequisite"),
    ctx.db
      .query("ketamineCoursePrerequisites")
      .withIndex("by_course", (q) => q.eq("courseId", courseId))
      .collect(),
  ]);
  const satisfiedKeys = new Set(satisfied.map((row) => row.key));
  const items = required.map((item) => ({
    ...item,
    satisfied: satisfiedKeys.has(item.key),
  }));
  const clearanceApproved = clearance?.decision === "approved";
  return {
    clearanceApproved,
    items,
    ready: clearanceApproved && items.every((item) => item.satisfied),
  };
}

export const getCourseReadiness = query({
  args: { courseId: v.id("ketamineCourses") },
  handler: async (ctx, { courseId }) => {
    await requireCapability(ctx, "clinical.manage");
    if (!(await ctx.db.get(courseId))) throw new Error("Course not found");
    return await buildCourseReadiness(ctx, courseId);
  },
});

export const createSession = mutation({
  args: {
    courseId: v.id("ketamineCourses"),
    appointmentId: v.optional(v.id("appointments")),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const course = await ctx.db.get(args.courseId);
    if (!course || course.state !== "active") {
      throw new Error("An active course is required");
    }
    if (args.appointmentId) {
      const appointment = await ctx.db.get(args.appointmentId);
      if (!appointment || appointment.patientId !== course.patientId) {
        throw new Error("Appointment does not belong to this patient");
      }
      const existing = await ctx.db
        .query("ketamineSessions")
        .withIndex("by_appointment", (q) =>
          q.eq("appointmentId", args.appointmentId),
        )
        .unique();
      if (existing) return existing._id;
    }
    const now = Date.now();
    const sessionId = await ctx.db.insert("ketamineSessions", {
      courseId: course._id,
      patientId: course.patientId,
      appointmentId: args.appointmentId,
      state: "planned",
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "ketamine.session.created",
      entityType: "ketamineSessions",
      entityId: sessionId,
    });
    return sessionId;
  },
});

export const cancelSession = mutation({
  args: { sessionId: v.id("ketamineSessions"), reason: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (!SESSION_TRANSITIONS[session.state].includes("cancelled")) {
      throw new Error(`Cannot cancel a session that is ${session.state}`);
    }
    const reason = requireReason(args.reason);
    await ctx.db.patch(session._id, {
      state: "cancelled",
      stateReason: reason,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "ketamine.session.cancelled",
      entityType: "ketamineSessions",
      entityId: session._id,
      reason,
    });
  },
});

// --- 10.4 Pre-session checklist ---------------------------------------

export const DEFAULT_CHECKLIST = [
  { key: "medicationConfirmed", label: "Medication details confirmed" },
  { key: "escortConfirmed", label: "Transportation or escort confirmed" },
] as const;

async function checklistFor(
  ctx: QueryCtx | MutationCtx,
  sessionId: Id<"ketamineSessions">,
): Promise<Doc<"ketamineSessionChecklists"> | null> {
  return await ctx.db
    .query("ketamineSessionChecklists")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .unique();
}

async function requiredChecklist(
  ctx: QueryCtx | MutationCtx,
): Promise<{ key: string; label: string }[]> {
  const configured = await protocolItems(ctx, "checklist");
  return configured.length > 0 ? configured : [...DEFAULT_CHECKLIST];
}

export const setChecklistItem = mutation({
  args: {
    sessionId: v.id("ketamineSessions"),
    key: v.string(),
    complete: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const session = await ctx.db.get(args.sessionId);
    if (!session || !["planned", "ready"].includes(session.state)) {
      throw new Error("Checklist is editable only before the session starts");
    }
    const required = await requiredChecklist(ctx);
    if (!required.some((item) => item.key === args.key)) {
      throw new Error(`Unknown checklist item: ${args.key}`);
    }
    const now = Date.now();
    const entry = {
      key: args.key,
      complete: args.complete,
      verifiedByUserId: actor._id,
      verifiedAt: now,
    };
    const existing = await checklistFor(ctx, session._id);
    if (existing) {
      await ctx.db.patch(existing._id, {
        items: [
          ...existing.items.filter((item) => item.key !== args.key),
          entry,
        ],
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("ketamineSessionChecklists", {
        sessionId: session._id,
        items: [entry],
        updatedAt: now,
      });
    }
    // Unchecking an item drops a ready session back to planned.
    if (!args.complete && session.state === "ready") {
      await ctx.db.patch(session._id, { state: "planned", updatedAt: now });
    }
    await writeAudit(ctx, {
      actor,
      action: "ketamine.checklist.updated",
      entityType: "ketamineSessions",
      entityId: session._id,
      reason: `${args.key}=${args.complete}`,
    });
  },
});

export interface SessionReadiness {
  ready: boolean;
  reasons: string[];
}

/** Operational ready/not-ready with explicit reasons. Never a clinical call. */
export async function buildSessionReadiness(
  ctx: QueryCtx | MutationCtx,
  session: Doc<"ketamineSessions">,
): Promise<SessionReadiness> {
  const reasons: string[] = [];
  const courseReadiness = await buildCourseReadiness(ctx, session.courseId);
  if (!courseReadiness.clearanceApproved) {
    reasons.push("Clinician clearance approval is missing");
  }
  for (const item of courseReadiness.items) {
    if (!item.satisfied) reasons.push(`Course prerequisite: ${item.label}`);
  }
  const required = await requiredChecklist(ctx);
  const checklist = await checklistFor(ctx, session._id);
  const complete = new Set(
    (checklist?.items ?? [])
      .filter((item) => item.complete)
      .map((item) => item.key),
  );
  for (const item of required) {
    if (!complete.has(item.key)) reasons.push(`Checklist: ${item.label}`);
  }
  const baseline = await ctx.db
    .query("sessionVitals")
    .withIndex("by_session", (q) => q.eq("sessionId", session._id))
    .collect();
  if (!baseline.some((row) => row.phase === "baseline")) {
    reasons.push("Baseline vitals are not recorded");
  }
  return { ready: reasons.length === 0, reasons };
}

export const getSessionReadiness = query({
  args: { sessionId: v.id("ketamineSessions") },
  handler: async (ctx, { sessionId }) => {
    await requireCapability(ctx, "clinical.manage");
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session not found");
    return await buildSessionReadiness(ctx, session);
  },
});

export const recordVitals = mutation({
  args: {
    sessionId: v.id("ketamineSessions"),
    phase: v.union(
      v.literal("baseline"),
      v.literal("monitoring"),
      v.literal("discharge"),
    ),
    systolic: v.number(),
    diastolic: v.number(),
    heartRate: v.number(),
    spo2: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const session = await ctx.db.get(args.sessionId);
    if (!session || ["completed", "cancelled"].includes(session.state)) {
      throw new Error("Session is not open");
    }
    if (args.phase === "monitoring" && session.state === "planned") {
      throw new Error("Monitoring vitals require a started session");
    }
    for (const [label, value] of [
      ["Systolic", args.systolic],
      ["Diastolic", args.diastolic],
      ["Heart rate", args.heartRate],
    ] as const) {
      if (!Number.isFinite(value) || value <= 0 || value > 400) {
        throw new Error(`${label} is out of range`);
      }
    }
    return await ctx.db.insert("sessionVitals", {
      sessionId: session._id,
      phase: args.phase,
      systolic: args.systolic,
      diastolic: args.diastolic,
      heartRate: args.heartRate,
      spo2: args.spo2,
      note: args.note?.trim() || undefined,
      recorderUserId: actor._id,
      recordedAt: Date.now(),
    });
  },
});

export const markSessionReady = mutation({
  args: {
    sessionId: v.id("ketamineSessions"),
    overrideReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.state !== "planned") {
      throw new Error("Only a planned session can be marked ready");
    }
    const readiness = await buildSessionReadiness(ctx, session);
    if (!readiness.ready) {
      if (args.overrideReason === undefined) {
        throw new Error(
          `Session is not ready: ${readiness.reasons.join("; ")}`,
        );
      }
      // Overrides are a policy-approved clinician action, always reasoned.
      await requireCapability(ctx, "encounter.sign");
      const reason = requireReason(args.overrideReason);
      await writeAudit(ctx, {
        actor,
        action: "ketamine.session.ready_override",
        entityType: "ketamineSessions",
        entityId: session._id,
        reason,
      });
    }
    await ctx.db.patch(session._id, { state: "ready", updatedAt: Date.now() });
    await writeAudit(ctx, {
      actor,
      action: "ketamine.session.ready",
      entityType: "ketamineSessions",
      entityId: session._id,
    });
  },
});

// --- 10.5 Session monitoring workspace --------------------------------
// Every entry is appended with a server timestamp and recorder identity,
// so the full timeline reconstructs from storage after any interruption —
// client timers are display only.

export const startSession = mutation({
  args: { sessionId: v.id("ketamineSessions") },
  handler: async (ctx, { sessionId }) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session not found");
    if (session.state !== "ready") {
      // Hard stop: readiness (10.4) is the only path to a startable session.
      throw new Error("Only a ready session can be started");
    }
    const now = Date.now();
    await ctx.db.patch(session._id, {
      state: "inProgress",
      startedAt: now,
      startedByUserId: actor._id,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "ketamine.session.started",
      entityType: "ketamineSessions",
      entityId: session._id,
    });
  },
});

export const addObservation = mutation({
  args: {
    sessionId: v.id("ketamineSessions"),
    kind: v.union(
      v.literal("observation"),
      v.literal("medicationAdministration"),
    ),
    text: v.string(),
    medication: v.optional(v.string()),
    dose: v.optional(v.string()),
    route: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const session = await ctx.db.get(args.sessionId);
    if (!session || !["inProgress", "recovery"].includes(session.state)) {
      throw new Error("Session is not in progress");
    }
    const text = requireReason(args.text);
    if (args.kind === "medicationAdministration" && !args.medication?.trim()) {
      throw new Error("Medication name is required");
    }
    return await ctx.db.insert("sessionObservations", {
      sessionId: session._id,
      kind: args.kind,
      text,
      medication: args.medication?.trim() || undefined,
      dose: args.dose?.trim() || undefined,
      route: args.route?.trim() || undefined,
      observerUserId: actor._id,
      recordedAt: Date.now(),
    });
  },
});

export const recordAdverseEvent = mutation({
  args: {
    sessionId: v.id("ketamineSessions"),
    description: v.string(),
    severity: v.union(
      v.literal("mild"),
      v.literal("moderate"),
      v.literal("severe"),
    ),
    actionsTaken: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const session = await ctx.db.get(args.sessionId);
    if (!session || !["inProgress", "recovery"].includes(session.state)) {
      throw new Error("Session is not in progress");
    }
    const eventId = await ctx.db.insert("adverseEvents", {
      sessionId: session._id,
      description: requireReason(args.description),
      severity: args.severity,
      actionsTaken: requireReason(args.actionsTaken),
      reporterUserId: actor._id,
      recordedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "ketamine.adverse_event.recorded",
      entityType: "adverseEvents",
      entityId: eventId,
    });
    return eventId;
  },
});

export const moveToRecovery = mutation({
  args: { sessionId: v.id("ketamineSessions") },
  handler: async (ctx, { sessionId }) => {
    const actor = await requireCapability(ctx, "clinical.manage");
    const session = await ctx.db.get(sessionId);
    if (!session || session.state !== "inProgress") {
      throw new Error("Only an in-progress session can enter recovery");
    }
    await ctx.db.patch(session._id, {
      state: "recovery",
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor,
      action: "ketamine.session.recovery",
      entityType: "ketamineSessions",
      entityId: session._id,
    });
  },
});

/** Full session detail: chronological timeline plus readiness. */
export const getSession = query({
  args: { sessionId: v.id("ketamineSessions") },
  handler: async (ctx, { sessionId }) => {
    await requireCapability(ctx, "clinical.manage");
    const session = await ctx.db.get(sessionId);
    if (!session) return null;
    const [vitals, observations, adverse, discharge, patient, readiness] =
      await Promise.all([
        ctx.db
          .query("sessionVitals")
          .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
          .collect(),
        ctx.db
          .query("sessionObservations")
          .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
          .collect(),
        ctx.db
          .query("adverseEvents")
          .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
          .collect(),
        ctx.db
          .query("dischargeRecords")
          .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
          .unique(),
        ctx.db.get(session.patientId),
        buildSessionReadiness(ctx, session),
      ]);
    return {
      session,
      patientName: patient
        ? `${patient.legalFirstName} ${patient.legalLastName}`
        : "(unknown)",
      vitals,
      observations,
      adverseEvents: adverse,
      discharge,
      readiness,
    };
  },
});

// --- 10.6 Discharge and completion ------------------------------------

export const DEFAULT_DISCHARGE_CRITERIA = [
  { key: "vitalsStable", label: "Vitals stable and within protocol range" },
  { key: "orientedAmbulatory", label: "Oriented and ambulatory per protocol" },
] as const;

export const recordDischarge = mutation({
  args: {
    sessionId: v.id("ketamineSessions"),
    metCriteriaKeys: v.array(v.string()),
    recoveryAssessment: v.string(),
    escortConfirmed: v.boolean(),
    patientInstructions: v.string(),
    followUpPlan: v.optional(v.string()),
    overrideReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Discharge is a clinician decision.
    const actor = await requireCapability(ctx, "encounter.sign");
    await requireCapability(ctx, "clinical.manage");
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.state !== "recovery") {
      throw new Error("Only a session in recovery can be discharged");
    }
    if (
      await ctx.db
        .query("dischargeRecords")
        .withIndex("by_session", (q) => q.eq("sessionId", session._id))
        .unique()
    ) {
      throw new Error("Session already has a discharge record");
    }
    const configured = await protocolItems(ctx, "dischargeCriteria");
    const required =
      configured.length > 0 ? configured : [...DEFAULT_DISCHARGE_CRITERIA];
    const met = new Set(args.metCriteriaKeys);
    for (const key of met) {
      if (!required.some((item) => item.key === key)) {
        throw new Error(`Unknown discharge criterion: ${key}`);
      }
    }
    const vitals = await ctx.db
      .query("sessionVitals")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .collect();
    const blockers = [
      ...required
        .filter((item) => !met.has(item.key))
        .map((item) => `Criterion not met: ${item.label}`),
      ...(vitals.some((row) => row.phase === "discharge")
        ? []
        : ["Final (discharge) vitals are not recorded"]),
      ...(args.escortConfirmed ? [] : ["Escort is not confirmed"]),
    ];
    if (blockers.length > 0) {
      if (args.overrideReason === undefined) {
        throw new Error(`Cannot discharge: ${blockers.join("; ")}`);
      }
      const reason = requireReason(args.overrideReason);
      await writeAudit(ctx, {
        actor,
        action: "ketamine.discharge.override",
        entityType: "ketamineSessions",
        entityId: session._id,
        reason,
      });
    }
    const now = Date.now();
    const dischargeId = await ctx.db.insert("dischargeRecords", {
      sessionId: session._id,
      criteria: required.map((item) => ({
        key: item.key,
        met: met.has(item.key),
      })),
      recoveryAssessment: requireReason(args.recoveryAssessment),
      escortConfirmed: args.escortConfirmed,
      patientInstructions: requireReason(args.patientInstructions),
      // ponytail: follow-up appointment/task creation arrives with the 11.1
      // task engine; until then the plan is preserved on the discharge record.
      followUpPlan: args.followUpPlan?.trim() || undefined,
      overrideReason: args.overrideReason?.trim() || undefined,
      dischargingUserId: actor._id,
      createdAt: now,
    });
    await ctx.db.patch(session._id, {
      state: "completed",
      endedAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: "ketamine.session.discharged",
      entityType: "dischargeRecords",
      entityId: dischargeId,
    });
    return dischargeId;
  },
});

/**
 * Published discharge instructions for the signed-in patient. Neutral
 * content only: instructions text and date, no clinical detail.
 */
export const listMyDischargeInstructions = query({
  args: {},
  handler: async (ctx) => {
    const { patient } = await requireLinkedPatient(ctx);
    const sessions = await ctx.db
      .query("ketamineSessions")
      .withIndex("by_state", (q) => q.eq("state", "completed"))
      .collect();
    const rows = [];
    for (const session of sessions) {
      if (session.patientId !== patient._id) continue;
      const discharge = await ctx.db
        .query("dischargeRecords")
        .withIndex("by_session", (q) => q.eq("sessionId", session._id))
        .unique();
      if (!discharge) continue;
      rows.push({
        sessionId: session._id,
        instructions: discharge.patientInstructions,
        dischargedAt: discharge.createdAt,
      });
    }
    return rows.sort((a, b) => b.dischargedAt - a.dischargedAt);
  },
});

// --- 10.7 Ketamine operations board -----------------------------------

/**
 * Daily readiness board. Minimal operational labels only: identity, state,
 * room, time, and blocker count — no diagnoses or clinical detail.
 */
export const listDayBoard = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    await requireCapability(ctx, "clinical.manage");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error("Date must be YYYY-MM-DD");
    }
    const sessions = await ctx.db.query("ketamineSessions").collect();
    const rows = [];
    for (const session of sessions) {
      if (session.state === "cancelled") continue;
      const appointment = session.appointmentId
        ? await ctx.db.get(session.appointmentId)
        : null;
      const appointmentDate = appointment
        ? zonedParts(appointment.startAt, appointment.timeZone).date
        : null;
      // Show the requested day's scheduled sessions plus anything still in
      // flight; unscheduled planned/ready sessions stay visible until booked.
      const inFlight =
        session.state === "inProgress" || session.state === "recovery";
      if (appointmentDate !== null && appointmentDate !== date && !inFlight) {
        continue;
      }
      if (appointmentDate === null && session.state === "completed") continue;
      const [patient, readiness] = await Promise.all([
        ctx.db.get(session.patientId),
        session.state === "planned"
          ? buildSessionReadiness(ctx, session)
          : Promise.resolve(null),
      ]);
      const roomNames = [];
      for (const resourceId of appointment?.resourceIds ?? []) {
        const resource = await ctx.db.get(resourceId);
        if (resource) roomNames.push(resource.name);
      }
      rows.push({
        sessionId: session._id,
        patientId: session.patientId,
        patientName: patient
          ? `${patient.legalLastName}, ${patient.preferredName ?? patient.legalFirstName}`
          : "(unknown)",
        state: session.state,
        appointmentStatus: appointment?.status ?? null,
        localTime: appointment
          ? formatLocalTime(appointment.startAt, appointment.timeZone)
          : null,
        startAt: appointment?.startAt ?? null,
        rooms: roomNames,
        blockers: readiness?.reasons ?? [],
      });
    }
    return rows.sort(
      (a, b) => (a.startAt ?? Infinity) - (b.startAt ?? Infinity),
    );
  },
});

export const listCoursesForPatient = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    await requireCapability(ctx, "clinical.manage");
    return await ctx.db
      .query("ketamineCourses")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .collect();
  },
});

export const getCourse = query({
  args: { courseId: v.id("ketamineCourses") },
  handler: async (ctx, { courseId }) => {
    await requireCapability(ctx, "clinical.manage");
    const course = await ctx.db.get(courseId);
    if (!course) return null;
    const [reviews, sessions] = await Promise.all([
      ctx.db
        .query("ketamineClearanceReviews")
        .withIndex("by_course", (q) => q.eq("courseId", courseId))
        .collect(),
      ctx.db
        .query("ketamineSessions")
        .withIndex("by_course", (q) => q.eq("courseId", courseId))
        .collect(),
    ]);
    return { course, reviews, sessions };
  },
});

export const listSessionsForCourse = query({
  args: { courseId: v.id("ketamineCourses") },
  handler: async (ctx, { courseId }) => {
    await requireCapability(ctx, "clinical.manage");
    return await ctx.db
      .query("ketamineSessions")
      .withIndex("by_course", (q) => q.eq("courseId", courseId))
      .collect();
  },
});
