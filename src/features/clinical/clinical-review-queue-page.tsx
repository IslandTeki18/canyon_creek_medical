import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";

export default function ClinicalReviewQueuePage() {
  const queue = useQuery(api.domains.clinical.listReviewQueue, {});
  const assessmentTasks = useQuery(api.domains.assessments.listReviewTasks, {});
  const acknowledge = useMutation(
    api.domains.assessments.acknowledgeReviewTask,
  );
  const resolveTask = useMutation(api.domains.assessments.resolveReviewTask);
  const [dispositions, setDispositions] = useState<Record<string, string>>({});
  const reconcileAllergy = useMutation(api.domains.clinical.reconcileAllergy);
  const reconcileMedication = useMutation(
    api.domains.clinical.reconcileMedication,
  );
  if (queue === undefined || assessmentTasks === undefined)
    return <p role="status">Loading review queue…</p>;
  const rows = [
    ...queue.allergies.map((item) => ({
      id: item._id,
      patientId: item.patientId,
      kind: "Allergy",
      name: item.allergen,
      resolve: (status: "confirmed" | "rejected") =>
        reconcileAllergy({
          allergyId: item._id,
          status,
          reason: "Clinician queue review",
        }),
    })),
    ...queue.medications.map((item) => ({
      id: item._id,
      patientId: item.patientId,
      kind: "Medication",
      name: item.name,
      resolve: (status: "confirmed" | "rejected") =>
        reconcileMedication({
          medicationId: item._id,
          status,
          reason: "Clinician queue review",
        }),
    })),
  ];
  return (
    <section>
      <h1 className="font-display text-3xl">Clinical reconciliation</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Clinical items awaiting human review. Assessment flags never make
        autonomous clinical changes.
      </p>
      {assessmentTasks.filter((task) => task.status !== "resolved").length >
        0 && (
        <section className="mt-4">
          <h2 className="text-xl font-semibold">High-priority assessments</h2>
          {assessmentTasks
            .filter((task) => task.status !== "resolved")
            .map((task) => (
              <div key={task._id} className="mt-2 rounded border p-3">
                <Link
                  to={`/app/patients/${task.patientId}`}
                  className="underline"
                >
                  Open patient chart
                </Link>
                <span className="ml-2 font-medium">{task.status}</span>
                {task.status === "open" && (
                  <button
                    type="button"
                    className="ml-2 rounded border px-2 py-1"
                    onClick={() => void acknowledge({ taskId: task._id })}
                  >
                    Acknowledge
                  </button>
                )}
                <div className="mt-2 flex gap-2">
                  <input
                    aria-label="Disposition"
                    value={dispositions[task._id] ?? ""}
                    onChange={(event) =>
                      setDispositions({
                        ...dispositions,
                        [task._id]: event.target.value,
                      })
                    }
                    className="rounded border px-2"
                  />
                  <button
                    type="button"
                    className="rounded border px-2 py-1"
                    onClick={() =>
                      void resolveTask({
                        taskId: task._id,
                        disposition: dispositions[task._id] ?? "",
                      })
                    }
                  >
                    Resolve
                  </button>
                </div>
              </div>
            ))}
        </section>
      )}
      {rows.length === 0 ? (
        <p className="mt-4">No reports awaiting review.</p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Patient</th>
              <th>Type</th>
              <th>Reported item</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b">
                <td className="py-2">
                  <Link
                    to={`/app/patients/${row.patientId}`}
                    className="underline"
                  >
                    Open chart
                  </Link>
                </td>
                <td>{row.kind}</td>
                <td>{row.name}</td>
                <td className="space-x-1">
                  <button
                    type="button"
                    className="rounded-full border px-2 py-1"
                    onClick={() => void row.resolve("confirmed")}
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    className="rounded-full border px-2 py-1"
                    onClick={() => void row.resolve("rejected")}
                  >
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
