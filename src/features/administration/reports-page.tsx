import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { REPORT_KEYS } from "../../../convex/lib/reports";
import { PermissionGate } from "../../lib/permission-gate";

const LABELS: Record<string, string> = {
  appointmentOutcomes: "Appointment outcomes",
  intakeCompletion: "Intake completion",
  reminderDelivery: "Reminder delivery",
  assessmentCompletion: "Assessment completion",
  serviceUtilization: "Service utilization",
};

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/** Outcome and utilization reports with an audited export (12.4). */
export default function ReportsPage() {
  const [report, setReport] = useState<string>(REPORT_KEYS[0]);
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [error, setError] = useState<string | null>(null);
  const result = useQuery(api.domains.reporting.runReport, {
    report,
    from,
    to,
  });
  const exportReport = useMutation(api.domains.reporting.exportReport);

  function download() {
    const reason = window.prompt("Reason for this export?");
    if (!reason) return;
    setError(null);
    exportReport({ report, from, to, reason })
      .then((file) => {
        const url = URL.createObjectURL(
          new Blob([file.csv], { type: "text/csv" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = file.fileName;
        link.click();
        URL.revokeObjectURL(url);
      })
      .catch((thrown: Error) => setError(thrown.message));
  }

  return (
    <section>
      <h1 className="font-display text-3xl">Reports</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Utilization and completion measures. These describe practice process,
        not clinical outcome or causation.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="report-key">Report</label>
        <select
          id="report-key"
          className="rounded border bg-card px-2 py-1"
          value={report}
          onChange={(event) => setReport(event.target.value)}
        >
          {REPORT_KEYS.map((key) => (
            <option key={key} value={key}>
              {LABELS[key] ?? key}
            </option>
          ))}
        </select>
        <label htmlFor="report-from">From</label>
        <input
          id="report-from"
          type="date"
          className="rounded border bg-card px-2 py-1"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
        <label htmlFor="report-to">To</label>
        <input
          id="report-to"
          type="date"
          className="rounded border bg-card px-2 py-1"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
        <PermissionGate capability="report.export">
          <button
            type="button"
            className="rounded border px-3 py-1"
            onClick={download}
          >
            Export CSV
          </button>
        </PermissionGate>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {result === undefined ? (
        <p role="status" className="mt-4 text-sm">
          Running report…
        </p>
      ) : result.rows.length === 0 ? (
        <p className="mt-4 text-sm">No activity in this range.</p>
      ) : (
        <>
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2">Bucket</th>
                {result.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.bucket} className="border-b">
                  <td className="py-2">{row.bucket}</td>
                  {result.columns.map((column) => (
                    <td key={column}>{row.metrics[column] ?? 0}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {result.truncated && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              Results were truncated at the row limit. Narrow the range.
            </p>
          )}
        </>
      )}
    </section>
  );
}
