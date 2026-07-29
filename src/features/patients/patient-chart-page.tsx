import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuthConfigured } from "../../lib/auth";
import { PermissionGate } from "../../lib/permission-gate";

const TABS = [
  "Summary",
  "Appointments",
  "Intake",
  "Medications",
  "Encounters",
  "Documents",
  "Tasks",
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
                : "bg-sand-deep text-foreground/80"
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
        {/* Alert placeholders land with clinical alerts (Increment 11). */}
        <p className="mt-1 text-xs text-muted-foreground/80">
          No active alerts.
        </p>
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
                ? "bg-primary hover:bg-clay-600 text-primary-foreground"
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
          </>
        ) : tab === "Appointments" ? (
          <AppointmentsTab patientId={patientId} />
        ) : tab === "Intake" ? (
          <IntakeTab patientId={patientId} />
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
    <div className="mt-4 max-w-lg rounded-organic p-6 bg-card shadow-organic-sm">
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
