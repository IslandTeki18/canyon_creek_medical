import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuthConfigured } from "../../lib/auth";

// 5.7 — waitlist. Staff capture demand and convert entries manually; the
// system never offers or matches slots on its own.

type Status = "open" | "contacted" | "converted" | "cancelled";

export default function WaitlistPage() {
  const configured = useAuthConfigured();
  return (
    <section>
      <h1 className="font-display text-3xl">Waitlist</h1>
      {configured ? (
        <Waitlist />
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Authentication is not configured in this environment.
        </p>
      )}
    </section>
  );
}

function Waitlist() {
  const [status, setStatus] = useState<Status | "">("open");
  const entries = useQuery(api.domains.waitlist.list, {
    status: status === "" ? undefined : status,
  });
  const setEntryStatus = useMutation(api.domains.waitlist.setStatus);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState<string | null>(null);

  return (
    <div className="mt-4">
      <label className="text-sm">
        Status
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Status | "")}
          className="mt-1 block w-40 rounded-full border bg-card px-3 py-1"
        >
          <option value="">All</option>
          <option value="open">Open</option>
          <option value="contacted">Contacted</option>
          <option value="converted">Converted</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </label>

      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {entries === undefined ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Loading waitlist…
        </p>
      ) : entries.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No waitlist entries. Add one from a patient chart.
        </p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Patient</th>
              <th>Type</th>
              <th>Window</th>
              <th>Preferred provider</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry._id} className="border-b align-top">
                <td className="py-2">
                  <Link
                    to={`/app/patients/${entry.patientId}`}
                    className="underline"
                  >
                    {entry.patientName}
                  </Link>
                </td>
                <td>{entry.appointmentTypeName}</td>
                <td>
                  {entry.fromDate} → {entry.toDate}
                </td>
                <td>{entry.preferredProviderName ?? "Any"}</td>
                <td>{entry.status}</td>
                <td className="space-x-2 py-2">
                  {entry.status !== "converted" &&
                    entry.status !== "cancelled" && (
                      <>
                        <button
                          type="button"
                          className="rounded-full border bg-card px-3 py-1 text-xs"
                          onClick={() => {
                            const reason = window.prompt("Contact note?");
                            if (!reason) return;
                            setError(null);
                            setEntryStatus({
                              entryId: entry._id,
                              status: "contacted",
                              reason,
                            }).catch((err) =>
                              setError(
                                err instanceof Error ? err.message : "Failed",
                              ),
                            );
                          }}
                        >
                          Log contact
                        </button>
                        <button
                          type="button"
                          className="rounded-full border bg-card px-3 py-1 text-xs"
                          onClick={() =>
                            setConverting(
                              converting === entry._id ? null : entry._id,
                            )
                          }
                        >
                          {converting === entry._id ? "Close" : "Convert…"}
                        </button>
                        <button
                          type="button"
                          className="rounded-full border bg-card px-3 py-1 text-xs"
                          onClick={() => {
                            const reason = window.prompt("Reason for removal?");
                            if (!reason) return;
                            setError(null);
                            setEntryStatus({
                              entryId: entry._id,
                              status: "cancelled",
                              reason,
                            }).catch((err) =>
                              setError(
                                err instanceof Error ? err.message : "Failed",
                              ),
                            );
                          }}
                        >
                          Remove
                        </button>
                      </>
                    )}
                  {entry.convertedAppointmentId && (
                    <Link
                      to={`/app/appointments/${entry.convertedAppointmentId}`}
                      className="text-xs underline"
                    >
                      View appointment
                    </Link>
                  )}
                  {converting === entry._id && (
                    <ConvertPanel
                      entryId={entry._id}
                      appointmentTypeId={entry.appointmentTypeId}
                      providerId={entry.preferredProviderId}
                      fromDate={entry.fromDate}
                      toDate={entry.toDate}
                      onError={setError}
                      onDone={() => setConverting(null)}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ConvertPanel({
  entryId,
  appointmentTypeId,
  providerId,
  fromDate,
  toDate,
  onError,
  onDone,
}: {
  entryId: Id<"waitlistEntries">;
  appointmentTypeId: Id<"appointmentTypes">;
  providerId?: Id<"providers">;
  fromDate: string;
  toDate: string;
  onError: (message: string | null) => void;
  onDone: () => void;
}) {
  const convert = useMutation(api.domains.waitlist.convert);
  const slots = useQuery(api.domains.appointments.listAvailableSlots, {
    appointmentTypeId,
    providerId,
    fromDate,
    toDate,
  });

  if (slots === undefined) {
    return (
      <p role="status" className="mt-2 text-xs text-muted-foreground">
        Loading available times…
      </p>
    );
  }
  if (slots.length === 0) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        No open times in this patient&rsquo;s window.
      </p>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {slots.slice(0, 24).map((slot) => (
        <button
          key={`${slot.providerId}:${slot.startAt}`}
          type="button"
          className="rounded-full border bg-card px-3 py-1 text-xs"
          onClick={() => {
            onError(null);
            convert({
              entryId,
              providerId: slot.providerId,
              startAt: slot.startAt,
            })
              .then((result) => {
                if (!result.ok) {
                  onError("That time was just taken. Pick another.");
                  return;
                }
                onDone();
              })
              .catch((err) =>
                onError(err instanceof Error ? err.message : "Failed"),
              );
          }}
        >
          {slot.date} {slot.localTime} · {slot.providerName}
        </button>
      ))}
    </div>
  );
}
