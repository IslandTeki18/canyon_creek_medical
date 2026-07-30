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
import { requireCapability } from "../lib/access";
import { writeAudit } from "../lib/audit";
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
