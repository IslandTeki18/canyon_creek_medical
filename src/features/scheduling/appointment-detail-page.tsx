import { useQuery } from "convex/react";
import { Link, useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuthConfigured } from "../../lib/auth";

// 5.5 — appointment detail with its append-only event history. Lifecycle
// actions arrive in 5.6.

export default function AppointmentDetailPage() {
  const configured = useAuthConfigured();
  const { appointmentId } = useParams();
  if (!configured || !appointmentId) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">Appointment</h1>
        <p className="mt-2 text-sm text-neutral-500">Not available.</p>
      </section>
    );
  }
  return <Detail appointmentId={appointmentId as Id<"appointments">} />;
}

function Detail({ appointmentId }: { appointmentId: Id<"appointments"> }) {
  const appointment = useQuery(api.domains.appointments.getAppointment, {
    appointmentId,
  });

  if (appointment === undefined) {
    return (
      <p role="status" className="text-sm text-neutral-500">
        Loading appointment…
      </p>
    );
  }
  if (appointment === null) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">Appointment</h1>
        <p className="mt-2 text-sm text-neutral-500">Appointment not found.</p>
        <Link to="/app/schedule" className="text-sm underline">
          Back to schedule
        </Link>
      </section>
    );
  }

  return (
    <section>
      <nav aria-label="Breadcrumb" className="text-sm text-neutral-500">
        <Link to="/app/schedule" className="underline">
          Schedule
        </Link>{" "}
        / Appointment
      </nav>
      <h1 className="mt-2 text-2xl font-semibold">
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
