import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";

export default function FailureQueuePage() {
  const failures = useQuery(api.domains.communications.listFailures, {});
  const retry = useMutation(api.domains.communications.retryFailure);
  const resolve = useMutation(api.domains.communications.resolveFailure);
  return (
    <section>
      <h1 className="font-display text-3xl">Failed communications</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Deliveries requiring staff follow-up.
      </p>
      {failures === undefined ? (
        <p role="status" className="mt-4">
          Loading failures…
        </p>
      ) : failures.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No unresolved failures.
        </p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Patient</th>
              <th>Channel</th>
              <th>Intent</th>
              <th>Attempts</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {failures.map((failure) => (
              <tr key={failure._id} className="border-b">
                <td className="py-2">
                  <Link
                    className="underline"
                    to={`/app/patients/${failure.patientId}`}
                  >
                    {failure.patientName}
                  </Link>
                </td>
                <td>{failure.channel}</td>
                <td>{failure.intent}</td>
                <td>{failure.retryCount}</td>
                <td>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-full border px-3 py-1"
                      onClick={() => {
                        const reason = window.prompt(
                          "Reason for manual resend?",
                        );
                        if (reason) void retry({ jobId: failure._id, reason });
                      }}
                    >
                      Retry…
                    </button>
                    <button
                      type="button"
                      className="rounded-full border px-3 py-1"
                      onClick={() => {
                        const reason = window.prompt("How was this resolved?");
                        if (reason)
                          void resolve({ jobId: failure._id, reason });
                      }}
                    >
                      Mark contacted…
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
