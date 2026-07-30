import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";

export default function MatQueuePage() {
  const queue = useQuery(api.domains.mat.listQueue, {});
  const refresh = useMutation(api.domains.mat.refreshQueue);
  const acknowledge = useMutation(api.domains.mat.acknowledgeQueueItem);
  const resolve = useMutation(api.domains.mat.resolveQueueItem);
  const [dispositions, setDispositions] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  if (queue === undefined) return <p role="status">Loading MAT queue…</p>;
  return (
    <section>
      <h1 className="font-display text-3xl">MAT follow-up queue</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Operational items only — open the chart for clinical detail.
      </p>
      <button
        type="button"
        className="mt-3 rounded border px-3 py-1 text-sm"
        onClick={() => void refresh({})}
      >
        Refresh queue
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {queue.length === 0 ? (
        <p className="mt-4">No open MAT work items.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {queue.map((item) => (
            <li key={item._id} className="rounded border p-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.patientName} · due{" "}
                    {new Date(item.dueAt).toLocaleDateString()} · {item.status}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {item.patientId && (
                    <Link
                      className="text-sm underline"
                      to={`/app/patients/${item.patientId}`}
                    >
                      Open chart
                    </Link>
                  )}
                  {item.status === "open" && (
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-sm"
                      onClick={() =>
                        acknowledge({ itemId: item._id }).catch((e: Error) =>
                          setError(e.message),
                        )
                      }
                    >
                      Acknowledge
                    </button>
                  )}
                  <input
                    aria-label={`Disposition for ${item.label}`}
                    className="rounded border px-2 py-1 text-sm"
                    placeholder="Disposition"
                    value={dispositions[item._id] ?? ""}
                    onChange={(event) =>
                      setDispositions((prev) => ({
                        ...prev,
                        [item._id]: event.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-sm"
                    onClick={() =>
                      resolve({
                        itemId: item._id,
                        disposition: dispositions[item._id] ?? "",
                      }).catch((e: Error) => setError(e.message))
                    }
                  >
                    Resolve
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
