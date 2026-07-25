import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { addDays } from "../../../convex/lib/time";
import { useAuthConfigured } from "../../lib/auth";

// 5.4 — staff booking. Slots come from the server; confirming rechecks
// availability inside the mutation, so a slot taken meanwhile is reported
// as a conflict rather than double-booked.

const WINDOW_DAYS = 7;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function BookAppointmentPage() {
  const configured = useAuthConfigured();
  const { patientId } = useParams();
  if (!configured || !patientId) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">Book appointment</h1>
        <p className="mt-2 text-sm text-neutral-500">Not available.</p>
      </section>
    );
  }
  return <Booking patientId={patientId as Id<"patients">} />;
}

function Booking({ patientId }: { patientId: Id<"patients"> }) {
  const navigate = useNavigate();
  const types = useQuery(api.domains.scheduling.listAppointmentTypes, {});
  const book = useMutation(api.domains.appointments.book);
  const [appointmentTypeId, setAppointmentTypeId] = useState("");
  const [fromDate, setFromDate] = useState(todayIso());
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState<number | null>(null);

  const activeTypes = (types ?? []).filter((t) => t.status === "active");
  const slots = useQuery(
    api.domains.appointments.listAvailableSlots,
    appointmentTypeId
      ? {
          appointmentTypeId: appointmentTypeId as Id<"appointmentTypes">,
          fromDate,
          toDate: addDays(fromDate, WINDOW_DAYS - 1),
        }
      : "skip",
  );

  async function confirm(slot: {
    startAt: number;
    providerId: Id<"providers">;
  }) {
    setStatus(null);
    setPending(slot.startAt);
    try {
      const result = await book({
        patientId,
        appointmentTypeId: appointmentTypeId as Id<"appointmentTypes">,
        providerId: slot.providerId,
        startAt: slot.startAt,
      });
      if (!result.ok) {
        setStatus("That time was just taken. Pick another slot.");
        return;
      }
      void navigate(`/app/patients/${patientId}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not book");
    } finally {
      setPending(null);
    }
  }

  return (
    <section>
      <nav aria-label="Breadcrumb" className="text-sm text-neutral-500">
        <Link to={`/app/patients/${patientId}`} className="underline">
          Chart
        </Link>{" "}
        / Book appointment
      </nav>
      <h1 className="mt-2 text-2xl font-semibold">Book appointment</h1>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Appointment type
          <select
            value={appointmentTypeId}
            onChange={(e) => setAppointmentTypeId(e.target.value)}
            className="mt-1 block w-64 rounded border px-2 py-1"
          >
            <option value="">Select…</option>
            {activeTypes.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name} ({t.durationMinutes} min, {t.locationName})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Week beginning
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="mt-1 block rounded border px-2 py-1"
          />
        </label>
      </div>

      {status && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {status}
        </p>
      )}

      {!appointmentTypeId ? (
        <p className="mt-4 text-sm text-neutral-500">
          Choose an appointment type to see available times.
        </p>
      ) : slots === undefined ? (
        <p role="status" className="mt-4 text-sm text-neutral-500">
          Loading available times…
        </p>
      ) : slots.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">
          No available times in this window. Try another week or check provider
          hours.
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {Object.entries(
            slots.reduce<Record<string, typeof slots>>((byDate, slot) => {
              (byDate[slot.date] ??= []).push(slot);
              return byDate;
            }, {}),
          ).map(([date, daySlots]) => (
            <li key={date}>
              <h2 className="text-sm font-semibold">{date}</h2>
              <div className="mt-1 flex flex-wrap gap-2">
                {daySlots.map((slot) => (
                  <button
                    key={`${slot.providerId}:${slot.startAt}`}
                    type="button"
                    disabled={pending !== null}
                    onClick={() => void confirm(slot)}
                    className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    {slot.localTime} · {slot.providerName}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-xs text-neutral-400">
        Times are shown in the location&rsquo;s time zone
        {slots?.[0] ? ` (${slots[0].timeZone})` : ""}.
      </p>
    </section>
  );
}
