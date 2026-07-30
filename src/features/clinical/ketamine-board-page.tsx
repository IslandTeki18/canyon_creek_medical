import { useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function KetamineBoardPage() {
  const [date, setDate] = useState(todayIso());
  const rows = useQuery(api.domains.ketamine.listDayBoard, { date });

  return (
    <section>
      <h1 className="font-display text-3xl">Ketamine operations board</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Operational readiness only — open the session for clinical detail.
      </p>
      <label className="mt-3 block text-sm">
        Day
        <input
          type="date"
          className="ml-2 rounded border px-2 py-1"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      {rows === undefined ? (
        <p role="status" className="mt-4">
          Loading board…
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-4">No ketamine sessions for this day.</p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 pr-4">Time</th>
              <th className="py-2 pr-4">Patient</th>
              <th className="py-2 pr-4">Room</th>
              <th className="py-2 pr-4">Session</th>
              <th className="py-2 pr-4">Appointment</th>
              <th className="py-2 pr-4">Blockers</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.sessionId} className="border-b align-top">
                <td className="py-2 pr-4">{row.localTime ?? "—"}</td>
                <td className="py-2 pr-4">{row.patientName}</td>
                <td className="py-2 pr-4">
                  {row.rooms.length > 0 ? row.rooms.join(", ") : "—"}
                </td>
                <td className="py-2 pr-4">{row.state}</td>
                <td className="py-2 pr-4">{row.appointmentStatus ?? "—"}</td>
                <td className="py-2 pr-4">
                  {row.blockers.length === 0 ? (
                    "—"
                  ) : (
                    <ul className="list-disc pl-4 text-destructive">
                      {row.blockers.map((blocker) => (
                        <li key={blocker}>{blocker}</li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="py-2">
                  <Link
                    className="underline"
                    to={`/app/ketamine/sessions/${row.sessionId}`}
                  >
                    Open session
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
