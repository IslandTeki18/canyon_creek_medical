import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const SEVERITIES = ["high", "notice", "info"] as const;
type Severity = (typeof SEVERITIES)[number];

const SEVERITY_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-900",
  notice: "bg-amber-100 text-amber-900",
  info: "bg-surface text-foreground/80",
};

/** Audit review (12.5). Read-only: the trail has no edit or delete path. */
export default function AuditPage() {
  const [severity, setSeverity] = useState<Severity | "">("");
  const [action, setAction] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const actors = useQuery(api.domains.audit.listActors, {});
  const highPriority = useQuery(api.domains.audit.listHighPriority, {
    limit: 10,
  });
  const events = useQuery(api.domains.audit.listEvents, {
    severity: severity || undefined,
    action: action || undefined,
    actorUserId: actorUserId ? (actorUserId as Id<"users">) : undefined,
    entityType: entityType || undefined,
    entityId: entityId || undefined,
  });

  return (
    <section>
      <h1 className="font-display text-3xl">Audit review</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Operational metadata only: who did what, to which record, when, and why.
        Audit records are append-only.
      </p>

      <h2 className="mt-6 font-medium">High priority</h2>
      {highPriority === undefined ? (
        <p role="status" className="text-sm">
          Loading…
        </p>
      ) : highPriority.length === 0 ? (
        <p className="mt-1 text-sm">
          No exports, role changes, overrides, or trust-boundary failures.
        </p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {highPriority.map((event) => (
            <li key={event._id}>
              <span className="text-muted-foreground">
                {new Date(event.createdAt).toLocaleString()}
              </span>{" "}
              <strong>{event.action}</strong> · {event.actorName}
              {event.reason ? ` · ${event.reason}` : ""}
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-8 font-medium">Search</h2>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="audit-severity">Severity</label>
        <select
          id="audit-severity"
          className="rounded border bg-card px-2 py-1"
          value={severity}
          onChange={(event) => setSeverity(event.target.value as Severity | "")}
        >
          <option value="">Any</option>
          {SEVERITIES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <label htmlFor="audit-actor">Actor</label>
        <select
          id="audit-actor"
          className="rounded border bg-card px-2 py-1"
          value={actorUserId}
          onChange={(event) => setActorUserId(event.target.value)}
        >
          <option value="">Anyone</option>
          {(actors ?? []).map((actor) => (
            <option key={actor._id} value={actor._id}>
              {actor.displayName}
            </option>
          ))}
        </select>
        <input
          aria-label="Action prefix"
          placeholder="Action prefix"
          className="rounded border bg-card px-2 py-1"
          value={action}
          onChange={(event) => setAction(event.target.value)}
        />
        <input
          aria-label="Entity type"
          placeholder="Entity type"
          className="rounded border bg-card px-2 py-1"
          value={entityType}
          onChange={(event) => setEntityType(event.target.value)}
        />
        <input
          aria-label="Entity id"
          placeholder="Entity id"
          className="rounded border bg-card px-2 py-1"
          value={entityId}
          onChange={(event) => setEntityId(event.target.value)}
        />
      </div>

      {events === undefined ? (
        <p role="status" className="mt-4 text-sm">
          Loading audit events…
        </p>
      ) : events.length === 0 ? (
        <p className="mt-4 text-sm">No events match these filters.</p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">When</th>
              <th>Severity</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Entity</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event._id} className="border-b">
                <td className="py-2">
                  {new Date(event.createdAt).toLocaleString()}
                </td>
                <td>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      SEVERITY_STYLES[event.severity] ?? ""
                    }`}
                  >
                    {event.severity}
                  </span>
                </td>
                <td>{event.action}</td>
                <td>{event.actorName}</td>
                <td>
                  {event.entityType}/{event.entityId}
                </td>
                <td>{event.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
