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
        <h1 className="text-2xl font-semibold">Patient chart</h1>
        <p className="mt-2 text-sm text-neutral-500">Not available.</p>
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
      <p role="status" className="text-sm text-neutral-500">
        Loading chart…
      </p>
    );
  }
  if (chart === null) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">Patient chart</h1>
        <p className="mt-2 text-sm text-neutral-500">Patient not found.</p>
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
      <nav aria-label="Breadcrumb" className="text-sm text-neutral-500">
        <Link to="/app/patients" className="underline">
          Patients
        </Link>{" "}
        / Chart
      </nav>

      <header className="mt-2 border-b pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{displayName}</h1>
          {patient.preferredName && (
            <span className="text-neutral-500">“{patient.preferredName}”</span>
          )}
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              patient.status === "active"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-neutral-200 text-neutral-700"
            }`}
          >
            {patient.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-neutral-600">
          DOB {patient.dateOfBirth}
          {communicationPreference &&
            ` · prefers ${communicationPreference.preferredChannel}`}
        </p>
        {/* Alert placeholders land with clinical alerts (Increment 11). */}
        <p className="mt-1 text-xs text-neutral-400">No active alerts.</p>
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
              tab === t ? "bg-neutral-900 text-white" : "border"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      <div className="mt-4 text-sm text-neutral-600">
        {tab === "Summary" ? (
          <SummaryTab chart={chart} />
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
        <span className="text-neutral-500">Archived: {archiveReason}</span>
      )}
      <input
        aria-label="Status change reason"
        placeholder="Reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="rounded border px-2 py-1"
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
        className="rounded border px-3 py-1.5 disabled:opacity-50"
      >
        {status === "active" ? "Archive patient" : "Reactivate patient"}
      </button>
      {error && (
        <span role="alert" className="text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}
