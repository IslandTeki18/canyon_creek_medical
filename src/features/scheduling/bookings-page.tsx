import { makeFunctionReference } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { addDays } from "../../../convex/lib/time";
import { useAuthConfigured } from "../../lib/auth";

type BookingStatus = Doc<"bookings">["status"];
type BookingRow = Doc<"bookings"> & { date: string; localTime: string };

const listBookings = makeFunctionReference<
  "query",
  { fromDate: string; toDate: string; status?: BookingStatus },
  BookingRow[]
>("domains/bookings:listBookings");
const setBookingStatus = makeFunctionReference<
  "mutation",
  {
    bookingId: Id<"bookings">;
    status: "completed" | "cancelled" | "noShow";
    reason?: string;
  },
  null
>("domains/bookings:setBookingStatus");

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function BookingsPage() {
  const configured = useAuthConfigured();
  return (
    <section>
      <h1 className="font-display text-3xl">Bookings</h1>
      {configured ? (
        <Bookings />
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Authentication is not configured in this environment.
        </p>
      )}
    </section>
  );
}

function Bookings() {
  const [view, setView] = useState<"day" | "week">("day");
  const [fromDate, setFromDate] = useState(todayIso());
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<Id<"bookings"> | null>(null);
  const toDate = view === "day" ? fromDate : addDays(fromDate, 6);
  const rows = useQuery(listBookings, { fromDate, toDate });
  const updateStatus = useMutation(setBookingStatus);

  async function transition(
    bookingId: Id<"bookings">,
    status: "completed" | "cancelled" | "noShow",
  ) {
    const reason =
      status === "completed"
        ? undefined
        : window.prompt(
            status === "cancelled"
              ? "Why is this booking being cancelled?"
              : "Why was this booking marked no-show?",
          );
    if (status !== "completed" && !reason?.trim()) return;
    setPending(bookingId);
    setMessage("");
    try {
      await updateStatus({ bookingId, status, reason: reason?.trim() });
      setMessage("Booking updated.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not update booking.",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          View
          <select
            value={view}
            onChange={(event) => setView(event.target.value as typeof view)}
            className="mt-1 block rounded-full border bg-card px-3 py-1"
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
            onChange={(event) => setFromDate(event.target.value)}
            className="mt-1 block rounded-full border bg-card px-3 py-1"
          />
        </label>
        <button
          type="button"
          onClick={() =>
            setFromDate(addDays(fromDate, view === "day" ? -1 : -7))
          }
          className="rounded-full border px-3 py-1.5 text-sm"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => setFromDate(addDays(fromDate, view === "day" ? 1 : 7))}
          className="rounded-full border px-3 py-1.5 text-sm"
        >
          Next
        </button>
      </div>

      {message && (
        <p role="status" className="mt-4 text-sm">
          {message}
        </p>
      )}
      {rows === undefined ? (
        <p role="status" className="mt-6 text-sm text-muted-foreground">
          Loading bookings…
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          No bookings for this range.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Bookings from {fromDate} to {toDate}
            </caption>
            <thead>
              <tr className="border-b">
                <th className="py-2">Time</th>
                <th>Name</th>
                <th>Service</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="border-b align-top">
                  <td className="py-2">
                    {view === "week" && <span>{row.date} </span>}
                    {row.localTime}
                  </td>
                  <td>{row.fullName}</td>
                  <td>{row.serviceName}</td>
                  <td>
                    {[row.email, row.phone].filter(Boolean).map((value) => (
                      <div key={value}>{value}</div>
                    ))}
                  </td>
                  <td>
                    <span className="rounded-full bg-muted px-2 py-1 text-xs">
                      {row.status}
                    </span>
                  </td>
                  <td>
                    {row.status === "booked" && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={pending === row._id}
                          onClick={() => void transition(row._id, "completed")}
                          className="rounded-full border px-2 py-1 text-xs"
                        >
                          Complete
                        </button>
                        <button
                          type="button"
                          disabled={pending === row._id}
                          onClick={() => void transition(row._id, "cancelled")}
                          className="rounded-full border px-2 py-1 text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={pending === row._id}
                          onClick={() => void transition(row._id, "noShow")}
                          className="rounded-full border px-2 py-1 text-xs"
                        >
                          No-show
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
