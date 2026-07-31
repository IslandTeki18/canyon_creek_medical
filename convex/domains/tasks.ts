// Task and work-queue engine (Increment 11.1). One operational action model
// shared by every domain: document review, clinical follow-up, front-desk
// work. Authorization is two-sided — the caller must hold the queue's
// capability and, when the task links a patient, patient access as well.
// Tasks carry neutral operational text only; clinical content belongs in the
// chart, never in a queue label.
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { requireAuthenticatedUser, requireCapability } from "../lib/access";
import { writeAudit } from "../lib/audit";
import { hasCapability, isCapability } from "../lib/permissions";

export type TaskStatus = Doc<"tasks">["status"];
export type TaskPriority = Doc<"tasks">["priority"];

const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  open: ["inProgress", "blocked", "completed", "cancelled"],
  inProgress: ["blocked", "completed", "cancelled"],
  blocked: ["open", "inProgress", "cancelled"],
  completed: [],
  cancelled: [],
};

const statusValidator = v.union(
  v.literal("open"),
  v.literal("inProgress"),
  v.literal("blocked"),
  v.literal("completed"),
  v.literal("cancelled"),
);

const priorityValidator = v.union(
  v.literal("low"),
  v.literal("normal"),
  v.literal("high"),
  v.literal("urgent"),
);

async function queueByKey(
  ctx: QueryCtx | MutationCtx,
  key: string,
): Promise<Doc<"taskQueues">> {
  const queue = await ctx.db
    .query("taskQueues")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (!queue || !queue.active) throw new Error("Queue not found");
  return queue;
}

/**
 * The single authorization gate for task access: queue capability plus, for
 * patient-linked work, patient.read. Every public function routes through it.
 */
async function requireTaskAccess(
  ctx: QueryCtx | MutationCtx,
  args: { queueKey: string; patientId?: Id<"patients"> },
): Promise<Doc<"users">> {
  const queue = await queueByKey(ctx, args.queueKey);
  if (!isCapability(queue.requiredCapability)) {
    throw new Error("Queue is misconfigured");
  }
  const actor = await requireCapability(ctx, queue.requiredCapability);
  if (args.patientId && !hasCapability(actor.roles, "patient.read")) {
    throw new Error("Not authorized");
  }
  return actor;
}

async function appendEvent(
  ctx: MutationCtx,
  args: {
    taskId: Id<"tasks">;
    kind: Doc<"taskEvents">["kind"];
    detail: string;
    actor: Doc<"users">;
  },
): Promise<void> {
  await ctx.db.insert("taskEvents", {
    taskId: args.taskId,
    kind: args.kind,
    detail: args.detail,
    actorUserId: args.actor._id,
    createdAt: Date.now(),
  });
}

// --- Queue configuration ---------------------------------------------

export const setQueue = mutation({
  args: {
    key: v.string(),
    label: v.string(),
    requiredCapability: v.string(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "config.manage");
    const key = args.key.trim();
    const label = args.label.trim();
    if (!key || !label) throw new Error("Key and label are required");
    if (!isCapability(args.requiredCapability)) {
      throw new Error("Unknown capability");
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("taskQueues")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const queueId = existing
      ? (await ctx.db.patch(existing._id, {
          label,
          requiredCapability: args.requiredCapability,
          active: args.active,
          updatedAt: now,
        }),
        existing._id)
      : await ctx.db.insert("taskQueues", {
          key,
          label,
          requiredCapability: args.requiredCapability,
          active: args.active,
          createdByUserId: actor._id,
          createdAt: now,
          updatedAt: now,
        });
    await writeAudit(ctx, {
      actor,
      action: "task.queue.set",
      entityType: "taskQueues",
      entityId: queueId,
    });
    return queueId;
  },
});

/** Queues the caller may act in. Drives queue pickers in the UI. */
export const listQueues = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireAuthenticatedUser(ctx);
    const queues = await ctx.db.query("taskQueues").collect();
    return queues
      .filter(
        (queue) =>
          queue.active &&
          isCapability(queue.requiredCapability) &&
          hasCapability(actor.roles, queue.requiredCapability),
      )
      .map(({ _id, key, label }) => ({ _id, key, label }));
  },
});

// --- Tasks -------------------------------------------------------------

/** Server-side creation path for domain code that raises operational work. */
export async function createTaskInternal(
  ctx: MutationCtx,
  args: {
    actor: Doc<"users">;
    queueKey: string;
    title: string;
    patientId?: Id<"patients">;
    entityType?: string;
    entityId?: string;
    priority?: TaskPriority;
    dueAt?: number;
  },
): Promise<Id<"tasks">> {
  const title = args.title.trim();
  if (!title) throw new Error("A task title is required");
  const now = Date.now();
  const taskId = await ctx.db.insert("tasks", {
    queueKey: args.queueKey,
    title,
    patientId: args.patientId,
    entityType: args.entityType,
    entityId: args.entityId,
    priority: args.priority ?? "normal",
    dueAt: args.dueAt,
    status: "open",
    createdByUserId: args.actor._id,
    createdAt: now,
    updatedAt: now,
  });
  await appendEvent(ctx, {
    taskId,
    kind: "created",
    detail: args.queueKey,
    actor: args.actor,
  });
  return taskId;
}

export const createTask = mutation({
  args: {
    queueKey: v.string(),
    title: v.string(),
    patientId: v.optional(v.id("patients")),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    priority: v.optional(priorityValidator),
    dueAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireTaskAccess(ctx, args);
    if (args.patientId) {
      const patient = await ctx.db.get(args.patientId);
      if (!patient) throw new Error("Patient not found");
    }
    const taskId = await createTaskInternal(ctx, { ...args, actor });
    await writeAudit(ctx, {
      actor,
      action: "task.created",
      entityType: "tasks",
      entityId: taskId,
    });
    return taskId;
  },
});

async function loadTaskForActor(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
): Promise<{ task: Doc<"tasks">; actor: Doc<"users"> }> {
  const task = await ctx.db.get(taskId);
  if (!task) throw new Error("Task not found");
  const actor = await requireTaskAccess(ctx, task);
  return { task, actor };
}

export const assignTask = mutation({
  args: { taskId: v.id("tasks"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const { task, actor } = await loadTaskForActor(ctx, args.taskId);
    if (task.status === "completed" || task.status === "cancelled") {
      throw new Error("Task is closed");
    }
    if (args.userId) {
      const assignee = await ctx.db.get(args.userId);
      if (!assignee || assignee.status !== "active") {
        throw new Error("Assignee not found");
      }
      const queue = await queueByKey(ctx, task.queueKey);
      if (
        !isCapability(queue.requiredCapability) ||
        !hasCapability(assignee.roles, queue.requiredCapability)
      ) {
        throw new Error("Assignee cannot access this queue");
      }
    }
    await ctx.db.patch(task._id, {
      assignedToUserId: args.userId,
      updatedAt: Date.now(),
    });
    await appendEvent(ctx, {
      taskId: task._id,
      kind: "assigned",
      detail: args.userId ? "assigned" : "unassigned",
      actor,
    });
    await writeAudit(ctx, {
      actor,
      action: "task.assigned",
      entityType: "tasks",
      entityId: task._id,
    });
  },
});

export const setPriority = mutation({
  args: { taskId: v.id("tasks"), priority: priorityValidator },
  handler: async (ctx, args) => {
    const { task, actor } = await loadTaskForActor(ctx, args.taskId);
    if (task.status === "completed" || task.status === "cancelled") {
      throw new Error("Task is closed");
    }
    await ctx.db.patch(task._id, {
      priority: args.priority,
      updatedAt: Date.now(),
    });
    await appendEvent(ctx, {
      taskId: task._id,
      kind: "priority",
      detail: `${task.priority} → ${args.priority}`,
      actor,
    });
    await writeAudit(ctx, {
      actor,
      action: "task.priority",
      entityType: "tasks",
      entityId: task._id,
      reason: args.priority,
    });
  },
});

export const setTaskStatus = mutation({
  args: {
    taskId: v.id("tasks"),
    status: statusValidator,
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { task, actor } = await loadTaskForActor(ctx, args.taskId);
    if (!TASK_TRANSITIONS[task.status].includes(args.status)) {
      throw new Error(`Cannot move task from ${task.status} to ${args.status}`);
    }
    const note = args.note?.trim();
    // Closing a task is a decision someone must be able to explain later.
    if (
      (args.status === "cancelled" || args.status === "blocked") &&
      (!note || note.length === 0)
    ) {
      throw new Error("A reason is required");
    }
    const closed = args.status === "completed" || args.status === "cancelled";
    await ctx.db.patch(task._id, {
      status: args.status,
      closedAt: closed ? Date.now() : undefined,
      updatedAt: Date.now(),
    });
    await appendEvent(ctx, {
      taskId: task._id,
      kind: "status",
      detail: `${task.status} → ${args.status}${note ? `: ${note}` : ""}`,
      actor,
    });
    await writeAudit(ctx, {
      actor,
      action: `task.${args.status}`,
      entityType: "tasks",
      entityId: task._id,
      reason: note,
    });
  },
});

// --- Views -------------------------------------------------------------

const OPEN_STATUSES: readonly TaskStatus[] = ["open", "inProgress", "blocked"];

async function decorate(
  ctx: QueryCtx,
  tasks: Doc<"tasks">[],
): Promise<
  (Doc<"tasks"> & { patientName: string | null; assigneeName: string | null })[]
> {
  return await Promise.all(
    tasks
      .sort((a, b) => (a.dueAt ?? a.createdAt) - (b.dueAt ?? b.createdAt))
      .map(async (task) => {
        const patient = task.patientId
          ? await ctx.db.get(task.patientId)
          : null;
        const assignee = task.assignedToUserId
          ? await ctx.db.get(task.assignedToUserId)
          : null;
        return {
          ...task,
          patientName: patient
            ? `${patient.legalLastName}, ${patient.legalFirstName}`
            : null,
          assigneeName: assignee?.displayName ?? null,
        };
      }),
  );
}

/**
 * Drops tasks the caller may not see. Queue access is re-derived per task so
 * a single list can never leak work from a queue the caller lacks.
 */
async function visibleTo(
  ctx: QueryCtx,
  actor: Doc<"users">,
  tasks: Doc<"tasks">[],
): Promise<Doc<"tasks">[]> {
  const queues = await ctx.db.query("taskQueues").collect();
  const allowed = new Set(
    queues
      .filter(
        (queue) =>
          queue.active &&
          isCapability(queue.requiredCapability) &&
          hasCapability(actor.roles, queue.requiredCapability),
      )
      .map((queue) => queue.key),
  );
  const patientAccess = hasCapability(actor.roles, "patient.read");
  return tasks.filter(
    (task) =>
      allowed.has(task.queueKey) &&
      (patientAccess || task.patientId === undefined),
  );
}

/** Personal view: everything assigned to the caller. */
export const listMyTasks = query({
  args: { includeClosed: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedUser(ctx);
    const statuses = args.includeClosed
      ? ([...OPEN_STATUSES, "completed", "cancelled"] as const)
      : OPEN_STATUSES;
    const tasks = (
      await Promise.all(
        statuses.map((status) =>
          ctx.db
            .query("tasks")
            .withIndex("by_assignee", (q) =>
              q.eq("assignedToUserId", actor._id).eq("status", status),
            )
            .collect(),
        ),
      )
    ).flat();
    return await decorate(ctx, await visibleTo(ctx, actor, tasks));
  },
});

/** Team view: one queue, open work first. */
export const listQueueTasks = query({
  args: { queueKey: v.string(), includeClosed: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const actor = await requireTaskAccess(ctx, { queueKey: args.queueKey });
    const statuses = args.includeClosed
      ? ([...OPEN_STATUSES, "completed", "cancelled"] as const)
      : OPEN_STATUSES;
    const tasks = (
      await Promise.all(
        statuses.map((status) =>
          ctx.db
            .query("tasks")
            .withIndex("by_queue_status", (q) =>
              q.eq("queueKey", args.queueKey).eq("status", status),
            )
            .collect(),
        ),
      )
    ).flat();
    return await decorate(ctx, await visibleTo(ctx, actor, tasks));
  },
});

/** Patient view: tasks linked to one chart, across accessible queues. */
export const listPatientTasks = query({
  args: { patientId: v.id("patients"), includeClosed: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "patient.read");
    const statuses = args.includeClosed
      ? ([...OPEN_STATUSES, "completed", "cancelled"] as const)
      : OPEN_STATUSES;
    const tasks = (
      await Promise.all(
        statuses.map((status) =>
          ctx.db
            .query("tasks")
            .withIndex("by_patient", (q) =>
              q.eq("patientId", args.patientId).eq("status", status),
            )
            .collect(),
        ),
      )
    ).flat();
    return await decorate(ctx, await visibleTo(ctx, actor, tasks));
  },
});

export const listTaskEvents = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    await requireTaskAccess(ctx, task);
    return await ctx.db
      .query("taskEvents")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
  },
});
