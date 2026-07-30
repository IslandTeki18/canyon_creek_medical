import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

function ElapsedTime({ startedAt }: { startedAt: number }) {
  // Display only — every stored timestamp is server-side.
  const [, tick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(interval);
  }, []);
  const minutes = Math.max(0, Math.floor((Date.now() - startedAt) / 60_000));
  return (
    <span>
      Elapsed: {Math.floor(minutes / 60)}h {minutes % 60}m
    </span>
  );
}

export default function KetamineSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const detail = useQuery(
    api.domains.ketamine.getSession,
    sessionId ? { sessionId: sessionId as Id<"ketamineSessions"> } : "skip",
  );
  const start = useMutation(api.domains.ketamine.startSession);
  const markReady = useMutation(api.domains.ketamine.markSessionReady);
  const recordVitals = useMutation(api.domains.ketamine.recordVitals);
  const addObservation = useMutation(api.domains.ketamine.addObservation);
  const recovery = useMutation(api.domains.ketamine.moveToRecovery);
  const adverse = useMutation(api.domains.ketamine.recordAdverseEvent);
  const [error, setError] = useState<string | null>(null);
  const [vitals, setVitals] = useState({ systolic: "", diastolic: "", hr: "" });
  const [note, setNote] = useState("");

  if (!sessionId) return <p role="alert">Missing session.</p>;
  if (detail === undefined) return <p role="status">Loading session…</p>;
  if (detail === null) return <p role="alert">Session not found.</p>;

  const { session, readiness } = detail;
  const open = session.state === "inProgress" || session.state === "recovery";
  const run = (action: Promise<unknown>) => {
    setError(null);
    action.catch((e: Error) => setError(e.message));
  };

  return (
    <section>
      <h1 className="font-display text-3xl">Ketamine session</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {detail.patientName} · {session.state}
        {session.startedAt && (
          <>
            {" · "}
            <ElapsedTime startedAt={session.startedAt} />
          </>
        )}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {!readiness.ready && session.state === "planned" && (
        <div className="mt-4 rounded border p-3">
          <h2 className="font-medium">Not ready</h2>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {readiness.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        {session.state === "planned" && (
          <button
            type="button"
            className="rounded border px-3 py-1 text-sm"
            onClick={() => run(markReady({ sessionId: session._id }))}
          >
            Mark ready
          </button>
        )}
        {session.state === "ready" && (
          <button
            type="button"
            className="rounded border px-3 py-1 text-sm"
            onClick={() => run(start({ sessionId: session._id }))}
          >
            Start session
          </button>
        )}
        {session.state === "inProgress" && (
          <button
            type="button"
            className="rounded border px-3 py-1 text-sm"
            onClick={() => run(recovery({ sessionId: session._id }))}
          >
            Move to recovery
          </button>
        )}
      </div>

      {open && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <form
            className="rounded border p-3"
            onSubmit={(event) => {
              event.preventDefault();
              run(
                recordVitals({
                  sessionId: session._id,
                  phase: "monitoring",
                  systolic: Number(vitals.systolic),
                  diastolic: Number(vitals.diastolic),
                  heartRate: Number(vitals.hr),
                }).then(() =>
                  setVitals({ systolic: "", diastolic: "", hr: "" }),
                ),
              );
            }}
          >
            <h2 className="font-medium">Record vitals</h2>
            {(
              [
                ["systolic", "Systolic"],
                ["diastolic", "Diastolic"],
                ["hr", "Heart rate"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="mt-2 block text-sm">
                {label}
                <input
                  required
                  type="number"
                  className="ml-2 w-24 rounded border px-2 py-1"
                  value={vitals[key]}
                  onChange={(e) =>
                    setVitals((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                />
              </label>
            ))}
            <button
              type="submit"
              className="mt-3 rounded border px-3 py-1 text-sm"
            >
              Save vitals
            </button>
          </form>
          <form
            className="rounded border p-3"
            onSubmit={(event) => {
              event.preventDefault();
              run(
                addObservation({
                  sessionId: session._id,
                  kind: "observation",
                  text: note,
                }).then(() => setNote("")),
              );
            }}
          >
            <h2 className="font-medium">Add observation</h2>
            <textarea
              required
              aria-label="Observation"
              className="mt-2 w-full rounded border px-2 py-1 text-sm"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              type="submit"
              className="mt-2 rounded border px-3 py-1 text-sm"
            >
              Save observation
            </button>
            <button
              type="button"
              className="ml-2 mt-2 rounded border px-3 py-1 text-sm"
              onClick={() => {
                const description = window.prompt("Adverse event description");
                const actions = description
                  ? window.prompt("Actions taken")
                  : null;
                if (description && actions) {
                  run(
                    adverse({
                      sessionId: session._id,
                      description,
                      severity: "moderate",
                      actionsTaken: actions,
                    }),
                  );
                }
              }}
            >
              Record adverse event
            </button>
          </form>
        </div>
      )}

      <h2 className="mt-6 font-medium">Timeline</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {[
          ...detail.vitals.map((v) => ({
            at: v.recordedAt,
            text: `Vitals (${v.phase}): ${v.systolic}/${v.diastolic}, HR ${v.heartRate}${v.spo2 ? `, SpO2 ${v.spo2}%` : ""}`,
          })),
          ...detail.observations.map((o) => ({
            at: o.recordedAt,
            text:
              o.kind === "medicationAdministration"
                ? `Medication: ${o.medication} ${o.dose ?? ""} ${o.route ?? ""} — ${o.text}`
                : `Observation: ${o.text}`,
          })),
          ...detail.adverseEvents.map((a) => ({
            at: a.recordedAt,
            text: `Adverse event (${a.severity}): ${a.description} — ${a.actionsTaken}`,
          })),
        ]
          .sort((a, b) => a.at - b.at)
          .map((entry) => (
            <li
              key={`${entry.at}-${entry.text}`}
              className="rounded border p-2"
            >
              <span className="text-muted-foreground">
                {new Date(entry.at).toLocaleTimeString()}
              </span>{" "}
              {entry.text}
            </li>
          ))}
      </ul>
    </section>
  );
}
