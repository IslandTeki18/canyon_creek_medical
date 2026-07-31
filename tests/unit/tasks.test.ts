// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedPatients } from "../fixtures/patients";

const modules = import.meta.glob("../../convex/**/*.ts");

async function seedWorld(tx: ReturnType<typeof convexTest>) {
  const admin = await seedUser(tx, ["administrator"], "task_admin");
  const clinical = await seedUser(tx, ["clinicalStaff"], "task_clinical");
  const frontDesk = await seedUser(tx, ["frontDesk"], "task_front_desk");
  const auditor = await seedUser(tx, ["auditor"], "task_auditor");
  await admin.mutation(api.domains.tasks.setQueue, {
    key: "clinicalFollowUp",
    label: "Clinical follow-up",
    requiredCapability: "clinical.manage",
    active: true,
  });
  await admin.mutation(api.domains.tasks.setQueue, {
    key: "frontDesk",
    label: "Front desk",
    requiredCapability: "appointment.manage",
    active: true,
  });
  const [patientId] = await seedPatients(tx);
  return { admin, clinical, frontDesk, auditor, patientId: patientId! };
}

test("a patient-linked task is visible only with queue and patient access", async () => {
  const tx = convexTest(schema, modules);
  const { clinical, frontDesk, auditor, patientId } = await seedWorld(tx);
  const taskId = await clinical.mutation(api.domains.tasks.createTask, {
    queueKey: "clinicalFollowUp",
    title: "Confirm follow-up interval",
    patientId,
    priority: "high",
  });

  const mine = await clinical.query(api.domains.tasks.listQueueTasks, {
    queueKey: "clinicalFollowUp",
  });
  expect(mine.map((t) => t._id)).toContain(taskId);
  expect(mine[0]?.patientName).toBe("Testerson, Avery");

  // Front desk holds patient.read but not the queue's clinical.manage.
  await expect(
    frontDesk.query(api.domains.tasks.listQueueTasks, {
      queueKey: "clinicalFollowUp",
    }),
  ).rejects.toThrow("Not authorized");
  // The patient view drops queues the caller cannot access.
  expect(
    await frontDesk.query(api.domains.tasks.listPatientTasks, { patientId }),
  ).toEqual([]);
  // Auditors hold neither.
  await expect(
    auditor.query(api.domains.tasks.listPatientTasks, { patientId }),
  ).rejects.toThrow("Not authorized");
});

test("status transitions are validated and closing requires a reason", async () => {
  const tx = convexTest(schema, modules);
  const { clinical } = await seedWorld(tx);
  const taskId = await clinical.mutation(api.domains.tasks.createTask, {
    queueKey: "clinicalFollowUp",
    title: "Call pharmacy about a coverage question",
  });
  await expect(
    clinical.mutation(api.domains.tasks.setTaskStatus, {
      taskId,
      status: "blocked",
    }),
  ).rejects.toThrow("A reason is required");
  await clinical.mutation(api.domains.tasks.setTaskStatus, {
    taskId,
    status: "inProgress",
  });
  await clinical.mutation(api.domains.tasks.setTaskStatus, {
    taskId,
    status: "completed",
  });
  await expect(
    clinical.mutation(api.domains.tasks.setTaskStatus, {
      taskId,
      status: "open",
    }),
  ).rejects.toThrow("Cannot move task from completed to open");

  const events = await clinical.query(api.domains.tasks.listTaskEvents, {
    taskId,
  });
  expect(events.map((e) => e.kind)).toEqual(["created", "status", "status"]);
});

test("assignment requires the assignee to hold the queue capability", async () => {
  const tx = convexTest(schema, modules);
  const { clinical } = await seedWorld(tx);
  const taskId = await clinical.mutation(api.domains.tasks.createTask, {
    queueKey: "clinicalFollowUp",
    title: "Review pending monitoring item",
  });
  const frontDeskUserId = await tx.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) =>
        q.eq("clerkUserId", "task_front_desk"),
      )
      .unique();
    return user!._id;
  });
  await expect(
    clinical.mutation(api.domains.tasks.assignTask, {
      taskId,
      userId: frontDeskUserId,
    }),
  ).rejects.toThrow("Assignee cannot access this queue");

  const clinicalUserId = await tx.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) =>
        q.eq("clerkUserId", "task_clinical"),
      )
      .unique();
    return user!._id;
  });
  await clinical.mutation(api.domains.tasks.assignTask, {
    taskId,
    userId: clinicalUserId,
  });
  const personal = await clinical.query(api.domains.tasks.listMyTasks, {});
  expect(personal.map((t) => t._id)).toEqual([taskId]);
});

test("queue configuration rejects unknown capabilities", async () => {
  const tx = convexTest(schema, modules);
  const { admin, clinical } = await seedWorld(tx);
  await expect(
    admin.mutation(api.domains.tasks.setQueue, {
      key: "bogus",
      label: "Bogus",
      requiredCapability: "not.a.capability",
      active: true,
    }),
  ).rejects.toThrow("Unknown capability");
  // Non-administrators cannot define queues.
  await expect(
    clinical.mutation(api.domains.tasks.setQueue, {
      key: "clinicalFollowUp",
      label: "Renamed",
      requiredCapability: "clinical.manage",
      active: true,
    }),
  ).rejects.toThrow("Not authorized");
  // Queue pickers list only queues whose capability the caller holds.
  expect(
    (await clinical.query(api.domains.tasks.listQueues, {})).map((q) => q.key),
  ).toEqual(["clinicalFollowUp", "frontDesk"]);
  const auditor = await seedUser(tx, ["auditor"], "task_auditor_2");
  expect(await auditor.query(api.domains.tasks.listQueues, {})).toEqual([]);
});
