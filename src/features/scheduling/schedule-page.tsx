import { useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { addDays } from "../../../convex/lib/time";
import { useAuthConfigured } from "../../lib/auth";

// 5.5 — day and week views plus the daily queue. Rendered as grouped tables:
// one accessible structure serves both the visual schedule and the list
// alternative. ponytail: a time-grid layout can be layered on top later; the
// query already returns everything it would need.

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SchedulePage() {
  const configured = useAuthConfigured();
  return (
    <section>
      <h1 className="text-2xl font-semibold">Schedule</h1>
      {configured ? (
        <Schedule />
      ) : (
        <p className="mt-2 text-sm text-neutral-500">
          Authentication is not configured in this environment.
        </p>
      )}
    </section>
  );
}

function Schedule() {
  const [view, setView] = useState<"day" | "week">("day");
  const [fromDate, setFromDate] = useState(todayIso());
  const [providerId, setProviderId] = useState("");
  const [locationId, setLocationId] = useState("");
  const providers = useQuery(api.domains.scheduling.listProviders, {});
  const locations = useQuery(api.domains.scheduling.listLocations, {});

  const toDate = view === "day" ? fromDate : addDays(fromDate, 6);
  const rows = useQuery(api.domains.appointments.listSchedule, {
    fromDate,
    toDate,
    providerId: providerId ? (providerId as Id<"providers">) : undefined,
    locationId: locationId ? (locationId as Id<"locations">) : undefined,
  });

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          View
          <select
            value={view}
            onChange={(e) => setView(e.target.value as typeof view)}
            className="mt-1 block rounded border px-2 py-1"
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
          </select>
        </label>
        <label className="text-sm">
          {view === "day" ? "Date" : "Week beginning"}
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="mt-1 block rounded border px-2 py-1"
          />
        </label>
        <label className="text-sm">
          Provider
          <select
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className="mt-1 block w-48 rounded border px-2 py-1"
          >
            <option value="">All providers</option>
            {(providers ?? []).map((p) => (
              <option key={p._id} value={p._id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Location
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="mt-1 block w-48 rounded border px-2 py-1"
          >
            <option value="">All locations</option>
            {(locations ?? []).map((l) => (
              <option key={l._id} value={l._id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() =>
            setFromDate(addDays(fromDate, view === "day" ? -1 : -7))
          }
          className="rounded border px-3 py-1.5 text-sm"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => setFromDate(addDays(fromDate, view === "day" ? 1 : 7))}
          className="rounded border px-3 py-1.5 text-sm"
        >
          Next
        </button>
      </div>

      {rows === undefined ? (
        <p role="status" className="mt-6 text-sm text-neutral-500">
          Loading schedule…
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">
          No appointments in this period.
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {Object.entries(
            rows.reduce<Record<string, typeof rows>>((byDate, row) => {
              (byDate[row.date] ??= []).push(row);
              return byDate;
            }, {}),
          ).map(([date, dayRows]) => (
            <div key={date}>
              <h2 className="text-sm font-semibold">{date}</h2>
              <table className="mt-2 w-full text-left text-sm">
                <caption className="sr-only">
                  Appointments on {date}, with readiness and status
                </caption>
                <thead>
                  <tr className="border-b">
                    <th className="py-2">Time</th>
                    <th>Patient</th>
                    <th>Type</th>
                    <th>Provider</th>
                    <th>Location</th>
                    <th>Readiness</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dayRows.map((row) => (
                    <tr key={row._id} className="border-b">
                      <td className="py-2">
                        <Link
                          to={`/app/appointments/${row._id}`}
                          className="underline"
                        >
                          {row.localTime}
                        </Link>
                      </td>
                      <td>
                        <Link
                          to={`/app/patients/${row.patientId}`}
                          className="underline"
                        >
                          {row.patientName}
                        </Link>
                      </td>
                      <td>{row.appointmentTypeName}</td>
                      <td>{row.providerName}</td>
                      <td>{row.locationName}</td>
                      <td>
                        {row.ready ? (
                          "Ready"
                        ) : (
                          <span className="text-amber-700">
                            {row.missingCount} missing
                          </span>
                        )}
                      </td>
                      <td>{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
