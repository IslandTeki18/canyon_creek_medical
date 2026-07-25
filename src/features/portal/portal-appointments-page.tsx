import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";

// 5.6 — the patient's own appointments. Cancellation appears only when the
// appointment type is configured for patient self-service; the server
// enforces the same rule.

export default function PortalAppointmentsPage() {
  const appointments = useQuery(
    api.domains.appointments.listMyAppointments,
    {},
  );
  const cancel = useMutation(api.domains.appointments.cancelMyAppointment);
  const [error, setError] = useState<string | null>(null);

  if (appointments === undefined) {
    return (
      <p role="status" className="text-sm text-neutral-500">
        Loading your appointments…
      </p>
    );
  }

  return (
    <section>
      <h1 className="text-xl font-semibold">Appointments</h1>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {appointments.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">
          You have no appointments scheduled. Call the practice to book one.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {appointments.map((a) => (
            <li key={a._id} className="rounded border p-3 text-sm">
              <p className="font-medium">
                {a.date} at {a.localTime}
              </p>
              <p className="text-neutral-600">
                {a.appointmentTypeName}
                {a.locationName ? ` · ${a.locationName}` : ""} ·{" "}
                {a.status === "scheduled"
                  ? "confirmed with the practice"
                  : a.status}
              </p>
              {a.cancellable && (
                <button
                  type="button"
                  className="mt-2 rounded border px-2 py-1 text-xs"
                  onClick={() => {
                    setError(null);
                    const reason = window.prompt(
                      "Let the practice know why you are cancelling:",
                    );
                    if (!reason) return;
                    cancel({ appointmentId: a._id, reason }).catch((err) =>
                      setError(
                        err instanceof Error ? err.message : "Could not cancel",
                      ),
                    );
                  }}
                >
                  Cancel appointment
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-xs text-neutral-500">
        Times are shown in the practice&rsquo;s local time zone. To change an
        appointment that cannot be cancelled here, please call the practice.
      </p>
    </section>
  );
}
