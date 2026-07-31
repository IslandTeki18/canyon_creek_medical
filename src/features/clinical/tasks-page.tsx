import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type Task = {
  _id: Id<"tasks">;
  title: string;
  queueKey: string;
  status: string;
  priority: string;
  dueAt?: number;
  patientId?: Id<"patients">;
  patientName: string | null;
  assigneeName: string | null;
};

/** Personal and team task views (11.1). Operational labels only. */
export default function TasksPage() {
  const queues = useQuery(api.domains.tasks.listQueues, {});
  const [queueKey, setQueueKey] = useState<string | null>(null);
  const mine = useQuery(api.domains.tasks.listMyTasks, {});
  const team = useQuery(
    api.domains.tasks.listQueueTasks,
    queueKey ? { queueKey } : "skip",
  );
  const [error, setError] = useState<string | null>(null);

  if (queues === undefined || mine === undefined) {
    return <p role="status">Loading tasks…</p>;
  }

  return (
    <section>
      <h1 className="font-display text-3xl">Tasks</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Operational work items only — open the chart for clinical detail.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <h2 className="mt-6 font-medium">Assigned to me</h2>
      <TaskList
        tasks={mine}
        onError={setError}
        emptyLabel="No tasks assigned to you."
      />

      <h2 className="mt-8 font-medium">Team queues</h2>
      {queues.length === 0 ? (
        <p className="mt-2 text-sm">You do not have access to any queue.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {queues.map((queue) => (
            <button
              key={queue.key}
              type="button"
              aria-pressed={queueKey === queue.key}
              onClick={() =>
                setQueueKey(queueKey === queue.key ? null : queue.key)
              }
              className={`rounded-full px-3 py-1 text-sm ${
                queueKey === queue.key
                  ? "bg-primary text-primary-foreground"
                  : "border"
              }`}
            >
              {queue.label}
            </button>
          ))}
        </div>
      )}
      {queueKey &&
        (team === undefined ? (
          <p role="status" className="mt-3 text-sm">
            Loading queue…
          </p>
        ) : (
          <TaskList
            tasks={team}
            onError={setError}
            emptyLabel="No open work in this queue."
          />
        ))}
    </section>
  );
}

export function TaskList({
  tasks,
  onError,
  emptyLabel,
}: {
  tasks: Task[];
  onError: (message: string) => void;
  emptyLabel: string;
}) {
  const setStatus = useMutation(api.domains.tasks.setTaskStatus);
  if (tasks.length === 0) return <p className="mt-2 text-sm">{emptyLabel}</p>;
  return (
    <ul className="mt-2 space-y-2">
      {tasks.map((task) => (
        <li key={task._id} className="rounded border p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{task.title}</p>
              <p className="text-sm text-muted-foreground">
                {task.queueKey} · {task.priority} · {task.status}
                {task.dueAt
                  ? ` · due ${new Date(task.dueAt).toLocaleDateString()}`
                  : ""}
                {task.patientName ? ` · ${task.patientName}` : ""}
                {task.assigneeName
                  ? ` · ${task.assigneeName}`
                  : " · unassigned"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {task.patientId && (
                <Link
                  className="text-sm underline"
                  to={`/app/patients/${task.patientId}`}
                >
                  Open chart
                </Link>
              )}
              {task.status !== "inProgress" && task.status !== "completed" && (
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-sm"
                  onClick={() =>
                    setStatus({ taskId: task._id, status: "inProgress" }).catch(
                      (e: Error) => onError(e.message),
                    )
                  }
                >
                  Start
                </button>
              )}
              <button
                type="button"
                className="rounded border px-2 py-1 text-sm"
                onClick={() =>
                  setStatus({ taskId: task._id, status: "completed" }).catch(
                    (e: Error) => onError(e.message),
                  )
                }
              >
                Complete
              </button>
              <button
                type="button"
                className="rounded border px-2 py-1 text-sm"
                onClick={() => {
                  const note = window.prompt("Reason for cancelling?");
                  if (note) {
                    void setStatus({
                      taskId: task._id,
                      status: "cancelled",
                      note,
                    }).catch((e: Error) => onError(e.message));
                  }
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
