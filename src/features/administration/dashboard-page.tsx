import { useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/** Daily operational dashboard (12.3). Aggregates and links, no patients. */
export default function DashboardPage() {
  const [date, setDate] = useState("");
  const [providerId, setProviderId] = useState("");
  const [locationId, setLocationId] = useState("");
  const providers = useQuery(api.domains.scheduling.listProviders, {});
  const locations = useQuery(api.domains.scheduling.listLocations, {});
  const dashboard = useQuery(api.domains.reporting.operationalDashboard, {
    date: date || undefined,
    providerId: providerId ? (providerId as Id<"providers">) : undefined,
    locationId: locationId ? (locationId as Id<"locations">) : undefined,
  });

  return (
    <section>
      <h1 className="font-display text-3xl">Operations dashboard</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Counts update live as the underlying records change. Open a metric to
        work its queue.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="dashboard-date">Date</label>
        <input
          id="dashboard-date"
          type="date"
          className="rounded border bg-card px-2 py-1"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
        <label htmlFor="dashboard-location">Location</label>
        <select
          id="dashboard-location"
          className="rounded border bg-card px-2 py-1"
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
        >
          <option value="">All</option>
          {(locations ?? []).map((location) => (
            <option key={location._id} value={location._id}>
              {location.name}
            </option>
          ))}
        </select>
        <label htmlFor="dashboard-provider">Provider</label>
        <select
          id="dashboard-provider"
          className="rounded border bg-card px-2 py-1"
          value={providerId}
          onChange={(event) => setProviderId(event.target.value)}
        >
          <option value="">All</option>
          {(providers ?? []).map((provider) => (
            <option key={provider._id} value={provider._id}>
              {provider.displayName}
            </option>
          ))}
        </select>
      </div>

      {dashboard === undefined ? (
        <p role="status" className="mt-4 text-sm">
          Loading dashboard…
        </p>
      ) : (
        <>
          <p className="mt-4 text-sm text-muted-foreground">
            {dashboard.date} · {dashboard.locationName ?? "all locations"} (
            {dashboard.timeZone})
          </p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dashboard.metrics.map((item) => (
              <li
                key={item.key}
                className="rounded-card p-5 bg-card shadow-card"
              >
                <p className="text-3xl font-display">{item.count}</p>
                <p className="mt-1 text-sm">{item.label}</p>
                {item.link && (
                  <Link to={item.link} className="text-sm underline">
                    Open queue
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
