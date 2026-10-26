import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { secondaryButtonClass } from "../../components/ui/content-card";
import { ReasonDialog } from "../../components/ui/reason-dialog";

type Status = Doc<"contactInquiries">["status"];
const filters: { status: Status; label: string }[] = [
  { status: "new", label: "New" },
  { status: "handled", label: "Handled" },
  { status: "archived", label: "Archived" },
];

export default function InquiriesPage() {
  const [status, setStatus] = useState<Status>("new");
  const inquiries = useQuery(api.domains.contact.listInquiries, { status });
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-[30px] font-extrabold tracking-[-0.025em]">
        Inquiries
      </h1>
      <div aria-label="Inquiry status" className="flex gap-2">
        {filters.map((filter) => (
          <button
            key={filter.status}
            type="button"
            aria-pressed={status === filter.status}
            onClick={() => setStatus(filter.status)}
            className={`min-h-11 rounded-full px-5 py-2 text-sm font-semibold ${status === filter.status ? "bg-primary text-white" : "bg-white text-ink/70 hover:text-primary"}`}
          >
            {filter.label}
          </button>
        ))}
      </div>
      {inquiries === undefined ? (
        <div
          role="status"
          aria-label="Loading inquiries"
          className="flex flex-col gap-3"
        >
          {[0, 1, 2].map((key) => (
            <div
              key={key}
              className="h-32 animate-pulse rounded-card bg-white"
            />
          ))}
        </div>
      ) : inquiries.length === 0 ? (
        <p className="text-sm text-ink/60">No inquiries.</p>
      ) : (
        <div className="divide-y divide-ink/10 rounded-card bg-white shadow-card">
          {inquiries.map((inquiry) => (
            <InquiryRow key={inquiry._id} inquiry={inquiry} />
          ))}
        </div>
      )}
    </section>
  );
}

function InquiryRow({ inquiry }: { inquiry: Doc<"contactInquiries"> }) {
  const setStatus = useMutation(api.domains.contact.setInquiryStatus);
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(status: "handled" | "archived", reason?: string) {
    setPending(true);
    setError(null);
    try {
      await setStatus({ inquiryId: inquiry._id, status, reason });
    } catch {
      const message = "Could not update this inquiry. Please try again.";
      setError(message);
      throw new Error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto font-semibold break-words">{inquiry.name}</h2>
        <time
          dateTime={new Date(inquiry.createdAt).toISOString()}
          className="text-xs text-ink/50 tabular-nums"
        >
          {new Date(inquiry.createdAt).toLocaleString()}
        </time>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${inquiry.status === "new" ? "bg-primary-tint text-primary" : inquiry.status === "handled" ? "bg-teal-tint text-teal" : "bg-ground text-ink/60"}`}
        >
          {filters.find((filter) => filter.status === inquiry.status)?.label}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <a className="break-all" href={`mailto:${inquiry.email}`}>
          {inquiry.email}
        </a>
        {inquiry.phone && (
          <a href={`tel:${inquiry.phone.replace(/[^+\d]/g, "")}`}>
            {inquiry.phone}
          </a>
        )}
      </div>
      <p
        id={`message-${inquiry._id}`}
        className={`text-sm leading-relaxed break-words whitespace-pre-wrap text-ink/80 ${expanded ? "" : "line-clamp-3"}`}
      >
        {inquiry.message}
      </p>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`message-${inquiry._id}`}
        onClick={() => setExpanded(!expanded)}
        className="min-h-11 self-start text-sm font-semibold text-primary"
      >
        {expanded ? "Show less" : "Show more"}
      </button>
      {inquiry.status !== "archived" && (
        <div className="flex flex-wrap gap-3">
          {inquiry.status === "new" && (
            <button
              type="button"
              disabled={pending}
              className={secondaryButtonClass}
              onClick={() => void update("handled").catch(() => {})}
            >
              {pending ? "Working…" : "Mark handled"}
            </button>
          )}
          <ReasonDialog
            title="Archive inquiry"
            description="Provide an operational reason for the audit record. Do not include the visitor’s message or health details."
            confirmLabel="Archive"
            confirmVariant="default"
            trigger={
              <button
                type="button"
                disabled={pending}
                className={secondaryButtonClass}
              >
                Archive
              </button>
            }
            onConfirm={(reason) => update("archived", reason)}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-alert">
          {error}
        </p>
      )}
    </article>
  );
}
