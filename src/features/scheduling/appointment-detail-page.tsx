import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PermissionGate } from "../../lib/permission-gate";
import { useAuthConfigured } from "../../lib/auth";

// 5.5/5.6 — appointment detail, append-only event history, and the
// lifecycle actions the server currently permits for this status.

const REASON_REQUIRED = new Set(["cancelled", "noShow"]);

const ACTION_LABELS: Record<string, string> = {
  confirmed: "Confirm",
  checkedIn: "Check in",
  inProgress: "Start visit",
  completed: "Complete",
  cancelled: "Cancel…",
  noShow: "Mark no-show…",
};

export default function AppointmentDetailPage() {
  const configured = useAuthConfigured();
  const { appointmentId } = useParams();
  if (!configured || !appointmentId) {
    return (
      <section>
        <h1 className="font-display text-3xl">Appointment</h1>
        <p className="mt-2 text-sm text-muted-foreground">Not available.</p>
      </section>
    );
  }
  return <Detail appointmentId={appointmentId as Id<"appointments">} />;
}

function LifecycleActions({
  appointmentId,
  appointmentTypeId,
  providerId,
  allowed,
  date,
}: {
  appointmentId: Id<"appointments">;
  appointmentTypeId: Id<"appointmentTypes">;
  providerId: Id<"providers">;
  allowed: readonly string[];
  date: string;
}) {
  const transition = useMutation(api.domains.appointments.transition);
  const reschedule = useMutation(api.domains.appointments.reschedule);
  const [error, setError] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState(date);

  const slots = useQuery(
    api.domains.appointments.listAvailableSlots,
    rescheduling
      ? { appointmentTypeId, providerId, fromDate: newDate, toDate: newDate }
      : "skip",
  );

  function report(err: unknown) {
    setError(err instanceof Error ? err.message : "Action failed");
  }

  if (allowed.length === 0) {
    return (
      <p className="mt-6 text-sm text-muted-foreground">
        This appointment is in a final state. Corrections are made by booking a
        new appointment.
      </p>
    );
  }

  return (
    <div className="mt-6">
      <h2 className="font-semibold">Actions</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {allowed.map((status) => (
          <button
            key={status}
            type="button"
            className="rounded-full border px-3 py-1.5 text-sm"
            onClick={() => {
              setError(null);
              const reason = REASON_REQUIRED.has(status)
                ? window.prompt("Reason?")
                : undefined;
              if (REASON_REQUIRED.has(status) && !reason) return;
              transition({
                appointmentId,
                toStatus: status as "confirmed",
                reason: reason ?? undefined,
              }).catch(report);
            }}
          >
            {ACTION_LABELS[status] ?? status}
          </button>
        ))}
        {allowed.includes("cancelled") && (
          <button
            type="button"
            className="rounded-full border px-3 py-1.5 text-sm"
            onClick={() => setRescheduling(!rescheduling)}
          >
            {rescheduling ? "Stop rescheduling" : "Reschedule…"}
          </button>
        )}
      </div>

      {rescheduling && (
        <div className="mt-3">
          <label className="text-sm">
            New date
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="mt-1 block rounded-full border bg-card px-3 py-1"
            />
          </label>
          {slots === undefined ? (
            <p role="status" className="mt-2 text-sm text-muted-foreground">
              Loading available times…
            </p>
          ) : slots.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No available times that day.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.startAt}
                  type="button"
                  className="rounded-full border px-3 py-1.5 text-sm"
                  onClick={() => {
                    setError(null);
                    const reason = window.prompt("Reason for rescheduling?");
                    if (!reason) return;
                    reschedule({
                      appointmentId,
                      startAt: slot.startAt,
                      reason,
                    })
                      .then(() => setRescheduling(false))
                      .catch(report);
                  }}
                >
                  {slot.localTime}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function Detail({ appointmentId }: { appointmentId: Id<"appointments"> }) {
  const appointment = useQuery(api.domains.appointments.getAppointment, {
    appointmentId,
  });

  if (appointment === undefined) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading appointment…
      </p>
    );
  }
  if (appointment === null) {
    return (
      <section>
        <h1 className="font-display text-3xl">Appointment</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Appointment not found.
        </p>
        <Link to="/app/schedule" className="text-sm underline">
          Back to schedule
        </Link>
      </section>
    );
  }

  return (
    <section>
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link to="/app/schedule" className="underline">
          Schedule
        </Link>{" "}
        / Appointment
      </nav>
      <h1 className="mt-2 font-display text-3xl">
        {appointment.appointmentTypeName}
      </h1>
      <dl className="mt-4 grid max-w-lg grid-cols-[10rem_1fr] gap-y-2 text-sm">
        <dt className="font-medium">Patient</dt>
        <dd>
          <Link
            to={`/app/patients/${appointment.patientId}`}
            className="underline"
          >
            {appointment.patientName}
          </Link>
        </dd>
        <dt className="font-medium">When</dt>
        <dd>
          {appointment.date} {appointment.localTime} ({appointment.timeZone})
        </dd>
        <dt className="font-medium">Provider</dt>
        <dd>{appointment.providerName}</dd>
        <dt className="font-medium">Location</dt>
        <dd>{appointment.locationName}</dd>
        <dt className="font-medium">Status</dt>
        <dd>{appointment.status}</dd>
        <dt className="font-medium">Readiness</dt>
        <dd>
          {appointment.ready
            ? "Ready"
            : `${appointment.missingCount} item(s) missing`}
        </dd>
      </dl>

      <PermissionGate capability="appointment.manage">
        <LifecycleActions
          appointmentId={appointmentId}
          appointmentTypeId={appointment.appointmentTypeId}
          providerId={appointment.providerId}
          allowed={appointment.allowedTransitions}
          date={appointment.date}
        />
      </PermissionGate>

      <h2 className="mt-6 font-semibold">History</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {appointment.events.map((event) => (
          <li key={event._id}>
            {new Date(event.createdAt)
              .toISOString()
              .slice(0, 16)
              .replace("T", " ")}{" "}
            — {event.fromStatus ? `${event.fromStatus} → ` : ""}
            {event.toStatus} by {event.actorName}
            {event.reason ? ` (${event.reason})` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}
