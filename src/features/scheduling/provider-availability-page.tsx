import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { zonedParts, zonedTimeToUtc } from "../../../convex/lib/time";
import { useAuthConfigured } from "../../lib/auth";

// 5.2 — provider working hours and time off. Wall-clock entry is converted
// to canonical instants using the selected location's time zone.

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function minutesFromTime(value: string): number {
  const [hour, minute] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

function timeFromMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export default function ProviderAvailabilityPage() {
  const configured = useAuthConfigured();
  return (
    <section>
      <h1 className="font-display text-3xl">Provider hours and time off</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        <Link to="/admin/scheduling" className="underline">
          Back to scheduling configuration
        </Link>
      </p>
      {configured ? (
        <Availability />
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Authentication is not configured in this environment.
        </p>
      )}
    </section>
  );
}

function Availability() {
  const providers = useQuery(api.domains.scheduling.listProviders, {});
  const locations = useQuery(api.domains.scheduling.listLocations, {});
  const users = useQuery(api.domains.workforce.listWorkforceUsers, {});
  const createProvider = useMutation(api.domains.scheduling.createProvider);
  const [providerId, setProviderId] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (providers === undefined || locations === undefined) {
    return (
      <p role="status" className="mt-4 text-sm text-muted-foreground">
        Loading providers…
      </p>
    );
  }

  const providerUsers = (users ?? []).filter(
    (u) =>
      u.roles.includes("provider") &&
      u.status === "active" &&
      !providers.some((p) => p.userId === u._id),
  );

  return (
    <div className="mt-6 space-y-8">
      <div>
        <h2 className="font-semibold">Bookable providers</h2>
        {providers.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No bookable providers yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {providers.map((p) => (
              <li key={p._id}>
                {p.displayName}{" "}
                <span className="text-muted-foreground">({p.status})</span>
              </li>
            ))}
          </ul>
        )}
        {providerUsers.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span>Add a provider-role user:</span>
            {providerUsers.map((u) => (
              <button
                key={u._id}
                type="button"
                className="rounded-full border bg-card px-3 py-1 text-xs"
                onClick={() => {
                  setError(null);
                  createProvider({
                    userId: u._id,
                    displayName: u.displayName,
                  }).catch((err) =>
                    setError(err instanceof Error ? err.message : "Failed"),
                  );
                }}
              >
                {u.displayName}
              </button>
            ))}
          </div>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <label className="block text-sm">
        Provider
        <select
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
          className="mt-1 block w-64 rounded-full border bg-card px-3 py-1"
        >
          <option value="">Select a provider…</option>
          {providers
            .filter((p) => p.status === "active")
            .map((p) => (
              <option key={p._id} value={p._id}>
                {p.displayName}
              </option>
            ))}
        </select>
      </label>

      {providerId && (
        <ProviderSchedule
          providerId={providerId as Id<"providers">}
          locations={locations.filter((l) => l.status === "active")}
        />
      )}
    </div>
  );
}

function ProviderSchedule({
  providerId,
  locations,
}: {
  providerId: Id<"providers">;
  locations: { _id: Id<"locations">; name: string; timeZone: string }[];
}) {
  const availability = useQuery(api.domains.scheduling.listAvailability, {
    providerId,
  });
  const createRule = useMutation(api.domains.scheduling.createAvailabilityRule);
  const deactivate = useMutation(
    api.domains.scheduling.deactivateAvailabilityRule,
  );
  const createTimeOff = useMutation(api.domains.scheduling.createTimeOff);
  const removeTimeOff = useMutation(api.domains.scheduling.removeTimeOff);
  const [locationId, setLocationId] = useState(locations[0]?._id ?? "");
  const [mode, setMode] = useState<"weekly" | "date">("weekly");
  const [weekday, setWeekday] = useState(1);
  const [date, setDate] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [offStart, setOffStart] = useState("");
  const [offEnd, setOffEnd] = useState("");
  const [offReason, setOffReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const timeZone =
    locations.find((l) => l._id === locationId)?.timeZone ?? "UTC";

  if (availability === undefined) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading schedule…
      </p>
    );
  }

  function toInstant(value: string): number | null {
    const [datePart, timePart] = value.split("T");
    if (!datePart || !timePart) return null;
    return zonedTimeToUtc(datePart, minutesFromTime(timePart), timeZone);
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-semibold">Working hours</h2>
        <form
          className="mt-2 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            createRule({
              providerId,
              locationId: locationId as Id<"locations">,
              weekday: mode === "weekly" ? weekday : undefined,
              date: mode === "date" ? date : undefined,
              startMinute: minutesFromTime(start),
              endMinute: minutesFromTime(end),
            }).catch((err) =>
              setError(err instanceof Error ? err.message : "Could not save"),
            );
          }}
        >
          <label className="text-sm">
            Location
            <select
              required
              value={locationId}
              onChange={(e) => setLocationId(e.target.value as Id<"locations">)}
              className="mt-1 block w-40 rounded-full border bg-card px-3 py-1"
            >
              {locations.map((l) => (
                <option key={l._id} value={l._id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Repeats
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
              className="mt-1 block w-32 rounded-full border bg-card px-3 py-1"
            >
              <option value="weekly">Weekly</option>
              <option value="date">One date</option>
            </select>
          </label>
          {mode === "weekly" ? (
            <label className="text-sm">
              Day
              <select
                value={weekday}
                onChange={(e) => setWeekday(Number(e.target.value))}
                className="mt-1 block w-32 rounded-full border bg-card px-3 py-1"
              >
                {WEEKDAYS.map((name, index) => (
                  <option key={name} value={index}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="text-sm">
              Date
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 block rounded-full border bg-card px-3 py-1"
              />
            </label>
          )}
          <label className="text-sm">
            Start
            <input
              type="time"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 block rounded-full border bg-card px-3 py-1"
            />
          </label>
          <label className="text-sm">
            End
            <input
              type="time"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 block rounded-full border bg-card px-3 py-1"
            />
          </label>
          <button
            type="submit"
            className="rounded-full bg-primary hover:bg-clay-600 px-3 py-1.5 text-sm text-primary-foreground"
          >
            Add hours
          </button>
        </form>
        {availability.rules.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No working hours configured.
          </p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm">
            {availability.rules.map((r) => (
              <li key={r._id}>
                {r.date ?? WEEKDAYS[r.weekday ?? 0]}{" "}
                {timeFromMinutes(r.startMinute)}–{timeFromMinutes(r.endMinute)}{" "}
                <button
                  type="button"
                  className="rounded-full border px-2 py-0.5 text-xs"
                  onClick={() => {
                    const reason = window.prompt("Reason for removing?");
                    if (reason) {
                      void deactivate({ ruleId: r._id, reason });
                    }
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="font-semibold">Time off</h2>
        <p className="text-xs text-muted-foreground">
          Entered in {timeZone} local time.
        </p>
        <form
          className="mt-2 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const startAt = toInstant(offStart);
            const endAt = toInstant(offEnd);
            if (startAt === null || endAt === null) {
              setError("That local time does not exist in this time zone.");
              return;
            }
            createTimeOff({
              providerId,
              startAt,
              endAt,
              reason: offReason,
            })
              .then(() => setOffReason(""))
              .catch((err) =>
                setError(err instanceof Error ? err.message : "Could not save"),
              );
          }}
        >
          <label className="text-sm">
            From
            <input
              type="datetime-local"
              required
              value={offStart}
              onChange={(e) => setOffStart(e.target.value)}
              className="mt-1 block rounded-full border bg-card px-3 py-1"
            />
          </label>
          <label className="text-sm">
            To
            <input
              type="datetime-local"
              required
              value={offEnd}
              onChange={(e) => setOffEnd(e.target.value)}
              className="mt-1 block rounded-full border bg-card px-3 py-1"
            />
          </label>
          <label className="text-sm">
            Reason
            <input
              required
              value={offReason}
              onChange={(e) => setOffReason(e.target.value)}
              className="mt-1 block w-48 rounded-full border bg-card px-3 py-1"
            />
          </label>
          <button
            type="submit"
            className="rounded-full bg-primary hover:bg-clay-600 px-3 py-1.5 text-sm text-primary-foreground"
          >
            Block time
          </button>
        </form>
        {availability.timeOff.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No time off recorded.
          </p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm">
            {availability.timeOff.map((t) => {
              const from = zonedParts(t.startAt, timeZone);
              const to = zonedParts(t.endAt, timeZone);
              return (
                <li key={t._id}>
                  {from.date} {timeFromMinutes(from.minutes)} → {to.date}{" "}
                  {timeFromMinutes(to.minutes)} — {t.reason}{" "}
                  <button
                    type="button"
                    className="rounded-full border px-2 py-0.5 text-xs"
                    onClick={() => {
                      const reason = window.prompt("Reason for removing?");
                      if (reason) {
                        void removeTimeOff({ timeOffId: t._id, reason });
                      }
                    }}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
