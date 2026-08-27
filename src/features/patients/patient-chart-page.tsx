import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuthConfigured } from "../../lib/auth";
import { PermissionGate } from "../../lib/permission-gate";
import {
  ClinicalListsSection,
  DiagnosesSection,
  EncountersSection,
  TreatmentPlansSection,
} from "../clinical/clinical-sections";
import { AssessmentSection } from "../clinical/assessment-section";
import { TaskList } from "../clinical/tasks-page";
import { DocumentsSection } from "./documents-section";

const TABS = [
  "Summary",
  "Timeline",
  "Appointments",
  "Intake",
  "Clinical lists",
  "Diagnoses",
  "Treatment plans",
  "Encounters",
  "Assessments",
  "Documents",
  "Tasks",
  "Communications",
  "Audit",
] as const;
type Tab = (typeof TABS)[number];

export default function PatientChartPage() {
  const configured = useAuthConfigured();
  const { patientId } = useParams();
  if (!configured || !patientId) {
    return (
      <section>
        <h1 className="font-display text-3xl">Patient chart</h1>
        <p className="mt-2 text-sm text-muted-foreground">Not available.</p>
      </section>
    );
  }
  return <Chart patientId={patientId as Id<"patients">} />;
}

function Chart({ patientId }: { patientId: Id<"patients"> }) {
  const chart = useQuery(api.domains.patients.getPatientChart, { patientId });
  const recordAccess = useMutation(api.domains.patients.recordChartAccess);
  const [tab, setTab] = useState<Tab>("Summary");

  useEffect(() => {
    // Chart-open audit event, once per visit.
    void recordAccess({ patientId });
  }, [patientId, recordAccess]);

  if (chart === undefined) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading chart…
      </p>
    );
  }
  if (chart === null) {
    return (
      <section>
        <h1 className="font-display text-3xl">Patient chart</h1>
        <p className="mt-2 text-sm text-muted-foreground">Patient not found.</p>
        <Link to="/app/patients" className="text-sm underline">
          Back to patients
        </Link>
      </section>
    );
  }

  const { patient, communicationPreference } = chart;
  const displayName = `${patient.legalLastName}, ${patient.legalFirstName}`;

  return (
    <section>
      {/* Breadcrumbs carry only opaque ids — never names or query params. */}
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link to="/app/patients" className="underline">
          Patients
        </Link>{" "}
        / Chart
      </nav>

      <header className="mt-2 border-b pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl">{displayName}</h1>
          {patient.preferredName && (
            <span className="text-muted-foreground">
              “{patient.preferredName}”
            </span>
          )}
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              patient.status === "active"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-surface text-foreground/80"
            }`}
          >
            {patient.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          DOB {patient.dateOfBirth}
          {communicationPreference &&
            ` · prefers ${communicationPreference.preferredChannel}`}
        </p>
        <AlertsHeader patientId={patientId} />
        <PermissionGate capability="patient.manage">
          <ArchiveControls
            patientId={patientId}
            status={patient.status}
            archiveReason={patient.archiveReason}
          />
        </PermissionGate>
      </header>

      <nav aria-label="Chart sections" className="mt-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-current={tab === t ? "page" : undefined}
            className={`rounded px-3 py-1.5 text-sm ${
              tab === t
                ? "bg-primary hover:bg-primary-deep text-primary-foreground"
                : "border"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      <div className="mt-4 text-sm text-muted-foreground">
        {tab === "Summary" ? (
          <>
            <ReadinessSection patientId={patientId} />
            <div className="mt-4">
              <SummaryTab chart={chart} />
            </div>
            <PermissionGate capability="clinical.manage">
              <AlertsManager patientId={patientId} />
            </PermissionGate>
          </>
        ) : tab === "Timeline" ? (
          <TimelineTab patientId={patientId} />
        ) : tab === "Appointments" ? (
          <AppointmentsTab patientId={patientId} />
        ) : tab === "Intake" ? (
          <IntakeTab patientId={patientId} />
        ) : tab === "Clinical lists" ? (
          <PermissionGate
            capability="clinical.manage"
            fallback={<p>You do not have access to clinical lists.</p>}
          >
            <ClinicalListsSection patientId={patientId} />
          </PermissionGate>
        ) : tab === "Diagnoses" ? (
          <PermissionGate
            capability="encounter.read"
            fallback={<p>You do not have access to diagnoses.</p>}
          >
            <DiagnosesSection patientId={patientId} />
          </PermissionGate>
        ) : tab === "Treatment plans" ? (
          <PermissionGate
            capability="encounter.read"
            fallback={<p>You do not have access to treatment plans.</p>}
          >
            <TreatmentPlansSection patientId={patientId} />
          </PermissionGate>
        ) : tab === "Encounters" ? (
          <PermissionGate
            capability="encounter.read"
            fallback={<p>You do not have access to encounters.</p>}
          >
            <EncountersSection patientId={patientId} />
          </PermissionGate>
        ) : tab === "Assessments" ? (
          <PermissionGate
            capability="encounter.read"
            fallback={<p>You do not have access to assessments.</p>}
          >
            <AssessmentSection patientId={patientId} />
          </PermissionGate>
        ) : tab === "Documents" ? (
          <DocumentsSection patientId={patientId} />
        ) : tab === "Tasks" ? (
          <TasksTab patientId={patientId} />
        ) : tab === "Communications" ? (
          <CommunicationsTab patientId={patientId} />
        ) : (
          <p>
            {tab} module arrives in a later increment. This tab is the stable
            destination for it.
          </p>
        )}
      </div>
    </section>
  );
}

const ALERT_STYLES: Record<string, string> = {
  info: "bg-sky-100 text-sky-900",
  warning: "bg-amber-100 text-amber-900",
  critical: "bg-red-100 text-red-900",
};

/**
 * Active clinical alerts (11.4). Alerts appear in the chart header only —
 * never in search results, queues, or notifications.
 */
function AlertsHeader({ patientId }: { patientId: Id<"patients"> }) {
  const alerts = useQuery(api.domains.alerts.listActive, { patientId });
  const acknowledge = useMutation(api.domains.alerts.acknowledgeAlert);
  if (alerts === undefined) {
    return (
      <p role="status" className="mt-1 text-xs text-muted-foreground/80">
        Loading alerts…
      </p>
    );
  }
  if (alerts.length === 0) {
    return (
      <p className="mt-1 text-xs text-muted-foreground/80">No active alerts.</p>
    );
  }
  return (
    <ul aria-label="Active alerts" className="mt-2 space-y-1">
      {alerts.map((alert) => (
        <li
          key={alert._id}
          className={`flex flex-wrap items-center gap-2 rounded px-3 py-1.5 text-sm ${
            ALERT_STYLES[alert.severity] ?? ""
          }`}
        >
          <span className="text-xs font-medium uppercase">
            {alert.severity}
          </span>
          <span>{alert.message}</span>
          {!alert.acknowledged && (
            <button
              type="button"
              className="rounded border border-current/30 px-2 py-0.5 text-xs"
              onClick={() => void acknowledge({ alertId: alert._id })}
            >
              Acknowledge
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Chronological index across appointments, forms, encounters, clinical
 * lists, documents, communications, and tasks (11.5). Entries the viewer
 * may not see are omitted server-side.
 */
function TimelineTab({ patientId }: { patientId: Id<"patients"> }) {
  const [type, setType] = useState<string | null>(null);
  const [limit, setLimit] = useState(25);
  const page = useQuery(api.domains.timeline.listForPatient, {
    patientId,
    types: type ? [type] : undefined,
    limit,
  });
  if (page === undefined) return <p role="status">Loading timeline…</p>;
  const types: string[] = Array.from(
    new Set(page.entries.map((entry) => entry.type)),
  );
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={type === null}
          onClick={() => setType(null)}
          className={`rounded-full px-3 py-1 text-sm ${
            type === null ? "bg-primary text-primary-foreground" : "border"
          }`}
        >
          All
        </button>
        {[...types, ...(type && !types.includes(type) ? [type] : [])].map(
          (value) => (
            <button
              key={value}
              type="button"
              aria-pressed={type === value}
              onClick={() => setType(value)}
              className={`rounded-full px-3 py-1 text-sm ${
                type === value ? "bg-primary text-primary-foreground" : "border"
              }`}
            >
              {value}
            </button>
          ),
        )}
      </div>
      {page.entries.length === 0 ? (
        <p className="mt-3">Nothing recorded yet.</p>
      ) : (
        <ol className="mt-3 space-y-1 text-sm">
          {page.entries.map((entry) => (
            <li key={`${entry.type}:${entry.id}`} className="border-b py-1">
              <span className="text-muted-foreground">
                {new Date(entry.at).toLocaleString()}
              </span>{" "}
              {entry.link ? (
                <Link to={entry.link} className="underline">
                  {entry.summary}
                </Link>
              ) : (
                entry.summary
              )}
            </li>
          ))}
        </ol>
      )}
      {page.nextBefore !== null && (
        <button
          type="button"
          className="mt-3 rounded border px-3 py-1 text-sm"
          onClick={() => setLimit((current) => current + 25)}
        >
          Show more
        </button>
      )}
    </div>
  );
}

/** Alert authoring and history (11.4), behind clinical.manage. */
function AlertsManager({ patientId }: { patientId: Id<"patients"> }) {
  const history = useQuery(api.domains.alerts.listHistory, { patientId });
  const create = useMutation(api.domains.alerts.createAlert);
  const archive = useMutation(api.domains.alerts.archiveAlert);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [type, setType] = useState("safety");
  const [severity, setSeverity] = useState<"info" | "warning" | "critical">(
    "warning",
  );
  const [visibility, setVisibility] = useState<"careTeam" | "allStaff">(
    "allStaff",
  );
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-6 max-w-2xl rounded-card p-6 bg-card shadow-card">
      <h2 className="font-medium">Clinical alerts</h2>
      <form
        className="mt-3 flex flex-wrap items-center gap-2 text-sm"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          create({
            patientId,
            type,
            severity,
            message,
            visibility,
            reason,
          })
            .then(() => {
              setMessage("");
              setReason("");
            })
            .catch((e: Error) => setError(e.message));
        }}
      >
        <label className="sr-only" htmlFor="alert-type">
          Alert type
        </label>
        <select
          id="alert-type"
          className="rounded border bg-card px-2 py-1"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="safety">safety</option>
          <option value="administrative">administrative</option>
          <option value="careCoordination">care coordination</option>
        </select>
        <label className="sr-only" htmlFor="alert-severity">
          Severity
        </label>
        <select
          id="alert-severity"
          className="rounded border bg-card px-2 py-1"
          value={severity}
          onChange={(event) =>
            setSeverity(event.target.value as typeof severity)
          }
        >
          <option value="info">info</option>
          <option value="warning">warning</option>
          <option value="critical">critical</option>
        </select>
        <label className="sr-only" htmlFor="alert-visibility">
          Visibility
        </label>
        <select
          id="alert-visibility"
          className="rounded border bg-card px-2 py-1"
          value={visibility}
          onChange={(event) =>
            setVisibility(event.target.value as typeof visibility)
          }
        >
          <option value="allStaff">all staff</option>
          <option value="careTeam">care team only</option>
        </select>
        <input
          aria-label="Alert message"
          placeholder="Message"
          className="min-w-56 rounded border bg-card px-2 py-1"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <input
          aria-label="Alert reason"
          placeholder="Reason"
          className="rounded border bg-card px-2 py-1"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <button
          type="submit"
          disabled={!message.trim() || !reason.trim()}
          className="rounded border px-3 py-1 disabled:opacity-50"
        >
          Add alert
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {history === undefined ? (
        <p role="status" className="mt-3 text-sm">
          Loading alert history…
        </p>
      ) : history.length === 0 ? (
        <p className="mt-3 text-sm">No alerts recorded.</p>
      ) : (
        <ul className="mt-3 space-y-1 text-sm">
          {history.map((alert) => (
            <li key={alert._id} className="flex items-center gap-2">
              <span>
                {alert.severity} · {alert.type} · {alert.message} (
                {alert.visibility}, {alert.status})
              </span>
              {alert.status === "active" && (
                <button
                  type="button"
                  className="rounded border px-2 py-0.5 text-xs"
                  onClick={() => {
                    const why = window.prompt("Reason for archiving?");
                    if (why) {
                      archive({ alertId: alert._id, reason: why }).catch(
                        (e: Error) => setError(e.message),
                      );
                    }
                  }}
                >
                  Archive
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Patient task view (11.1). Queues the viewer cannot access are dropped
 *  server-side, so this list is already permission-filtered. */
function TasksTab({ patientId }: { patientId: Id<"patients"> }) {
  const tasks = useQuery(api.domains.tasks.listPatientTasks, { patientId });
  const queues = useQuery(api.domains.tasks.listQueues, {});
  const create = useMutation(api.domains.tasks.createTask);
  const [title, setTitle] = useState("");
  const [queueKey, setQueueKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (tasks === undefined || queues === undefined) {
    return <p role="status">Loading tasks…</p>;
  }
  return (
    <div>
      {queues.length > 0 && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            create({
              patientId,
              queueKey: queueKey || queues[0]!.key,
              title,
            })
              .then(() => setTitle(""))
              .catch((e: Error) => setError(e.message));
          }}
        >
          <label className="sr-only" htmlFor="task-queue">
            Queue
          </label>
          <select
            id="task-queue"
            className="rounded border bg-card px-2 py-1 text-sm"
            value={queueKey || queues[0]!.key}
            onChange={(event) => setQueueKey(event.target.value)}
          >
            {queues.map((queue) => (
              <option key={queue.key} value={queue.key}>
                {queue.label}
              </option>
            ))}
          </select>
          <input
            aria-label="Task title"
            placeholder="Operational task (no clinical detail)"
            className="min-w-64 rounded border bg-card px-2 py-1 text-sm"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <button
            type="submit"
            disabled={!title.trim()}
            className="rounded border px-3 py-1 text-sm disabled:opacity-50"
          >
            Add task
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <TaskList
        tasks={tasks}
        onError={setError}
        emptyLabel="No open tasks for this patient."
      />
    </div>
  );
}

function CommunicationsTab({ patientId }: { patientId: Id<"patients"> }) {
  const history = useQuery(api.domains.communications.listPatientHistory, {
    patientId,
  });
  if (history === undefined) {
    return <p role="status">Loading communication history…</p>;
  }
  if (history.length === 0) return <p>No communications yet.</p>;
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b">
          <th className="py-2">Date</th>
          <th>Channel</th>
          <th>Intent</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {history.map((item) => (
          <tr key={item._id} className="border-b">
            <td className="py-2">
              {new Date(item.updatedAt).toLocaleString()}
            </td>
            <td>{item.channel}</td>
            <td>{item.intent}</td>
            <td>{item.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SummaryTab({
  chart,
}: {
  chart: NonNullable<
    ReturnType<typeof useQuery<typeof api.domains.patients.getPatientChart>>
  >;
}) {
  const { patient, communicationPreference, emergencyContacts, pharmacies } =
    chart;
  return (
    <dl className="grid max-w-lg grid-cols-[10rem_1fr] gap-y-2">
      <dt className="font-medium">Email</dt>
      <dd>{patient.email ?? "—"}</dd>
      <dt className="font-medium">Phone</dt>
      <dd>{patient.phone ?? "—"}</dd>
      <dt className="font-medium">Communication</dt>
      <dd>
        {communicationPreference
          ? [
              communicationPreference.smsOptIn && "SMS",
              communicationPreference.emailOptIn && "email",
              communicationPreference.voiceOptIn && "voice",
            ]
              .filter(Boolean)
              .join(", ") || "all channels opted out"
          : "—"}
      </dd>
      <dt className="font-medium">Emergency contacts</dt>
      <dd>{emergencyContacts.length || "None recorded"}</dd>
      <dt className="font-medium">Preferred pharmacy</dt>
      <dd>{pharmacies.find((p) => p.isPreferred)?.name ?? "None recorded"}</dd>
    </dl>
  );
}

/** Readiness badge + checklist (4.6): explains every missing requirement. */
function ReadinessSection({ patientId }: { patientId: Id<"patients"> }) {
  const readiness = useQuery(api.domains.patients.getPatientReadiness, {
    patientId,
  });
  if (!readiness) return null;
  const missing = readiness.items.filter((i) => !i.satisfied);
  return (
    <div className="mt-4 max-w-lg rounded-card p-6 bg-card shadow-card">
      <h2 className="font-medium">
        Readiness:{" "}
        <span
          className={`rounded px-2 py-0.5 text-xs ${
            readiness.ready
              ? "bg-green-100 text-green-800"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          {readiness.ready ? "Ready" : `${missing.length} item(s) missing`}
        </span>
      </h2>
      <ul className="mt-2 space-y-1">
        {readiness.items.map((item) => (
          <li key={`${item.kind}:${item.label}`}>
            <span aria-hidden="true">{item.satisfied ? "✓" : "○"}</span>{" "}
            {item.label}
            <span className="text-xs text-muted-foreground/80">
              {" "}
              ({item.kind})
            </span>
            {!item.satisfied && (
              <span className="text-muted-foreground"> — missing</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AppointmentsTab({ patientId }: { patientId: Id<"patients"> }) {
  const appointments = useQuery(api.domains.appointments.listForPatient, {
    patientId,
  });
  return (
    <div>
      <PermissionGate capability="appointment.manage">
        <Link
          to={`/app/patients/${patientId}/book`}
          className="rounded-full border px-3 py-1.5 text-sm"
        >
          Book appointment
        </Link>
      </PermissionGate>
      {appointments === undefined ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          Loading appointments…
        </p>
      ) : appointments.length === 0 ? (
        <p className="mt-3">No appointments yet.</p>
      ) : (
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Date</th>
              <th>Time</th>
              <th>Type</th>
              <th>Provider</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((a) => (
              <tr key={a._id} className="border-b">
                <td className="py-2">
                  <Link to={`/app/appointments/${a._id}`} className="underline">
                    {a.date}
                  </Link>
                </td>
                <td>{a.localTime}</td>
                <td>{a.appointmentTypeName}</td>
                <td>{a.providerName}</td>
                <td>{a.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function IntakeTab({ patientId }: { patientId: Id<"patients"> }) {
  const assignments = useQuery(api.domains.assignments.listForPatient, {
    patientId,
  });
  const run = useMutation(api.domains.assignments.runForPatient);
  const waive = useMutation(api.domains.assignments.waiveAssignment);
  const [error, setError] = useState<string | null>(null);

  if (assignments === undefined) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading intake status…
      </p>
    );
  }
  return (
    <div>
      <PermissionGate capability="patient.manage">
        <button
          type="button"
          onClick={() => {
            setError(null);
            run({ patientId }).catch(() =>
              setError("Could not run assignment rules."),
            );
          }}
          className="rounded-full border px-3 py-1.5 text-sm"
        >
          Run assignment rules
        </button>
      </PermissionGate>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {assignments.length === 0 ? (
        <p className="mt-3">No forms assigned.</p>
      ) : (
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Form</th>
              <th>Type</th>
              <th>Source</th>
              <th>State</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a._id} className="border-b">
                <td className="py-2">{a.templateName}</td>
                <td>{a.templateType}</td>
                <td>{a.source}</td>
                <td>
                  {a.state}
                  {a.state === "waived" && a.waiveReason
                    ? ` (${a.waiveReason})`
                    : ""}
                </td>
                <td>
                  {a.state === "pending" && (
                    <PermissionGate capability="patient.manage">
                      <button
                        type="button"
                        onClick={() => {
                          const reason = window.prompt("Reason for waiving?");
                          if (reason) {
                            void waive({ assignmentId: a._id, reason }).catch(
                              () => setError("Could not waive."),
                            );
                          }
                        }}
                        className="rounded-full border bg-card px-3 py-1 text-xs"
                      >
                        Waive…
                      </button>
                    </PermissionGate>
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

function ArchiveControls({
  patientId,
  status,
  archiveReason,
}: {
  patientId: Id<"patients">;
  status: "active" | "archived";
  archiveReason?: string;
}) {
  const setStatus = useMutation(api.domains.patients.setPatientStatus);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const next = status === "active" ? "archived" : "active";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      {status === "archived" && archiveReason && (
        <span className="text-muted-foreground">Archived: {archiveReason}</span>
      )}
      <input
        aria-label="Status change reason"
        placeholder="Reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="rounded-full border bg-card px-3 py-1"
      />
      <button
        type="button"
        disabled={!reason.trim()}
        onClick={async () => {
          setError(null);
          try {
            await setStatus({ patientId, status: next, reason });
            setReason("");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed");
          }
        }}
        className="rounded-full border px-3 py-1.5 disabled:opacity-50"
      >
        {status === "active" ? "Archive patient" : "Reactivate patient"}
      </button>
      {error && (
        <span role="alert" className="text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
