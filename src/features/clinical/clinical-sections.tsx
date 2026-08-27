import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PermissionGate } from "../../lib/permission-gate";

const inputClass = "rounded-full border bg-card px-3 py-1.5";

export function ClinicalListsSection({
  patientId,
}: {
  patientId: Id<"patients">;
}) {
  const lists = useQuery(api.domains.clinical.listClinicalLists, { patientId });
  const createAllergy = useMutation(api.domains.clinical.createAllergy);
  const createMedication = useMutation(api.domains.clinical.createMedication);
  const reconcileAllergy = useMutation(api.domains.clinical.reconcileAllergy);
  const reconcileMedication = useMutation(
    api.domains.clinical.reconcileMedication,
  );
  const setAllergyStatus = useMutation(api.domains.clinical.setAllergyStatus);
  const setMedicationStatus = useMutation(
    api.domains.clinical.setMedicationStatus,
  );
  const [error, setError] = useState<string | null>(null);

  if (lists === undefined) return <p role="status">Loading clinical lists…</p>;
  const act = (promise: Promise<unknown>) => {
    setError(null);
    void promise.catch((cause) =>
      setError(cause instanceof Error ? cause.message : "Could not update"),
    );
  };
  return (
    <div className="space-y-8">
      <PermissionGate capability="clinical.manage">
        <div className="grid gap-4 lg:grid-cols-2">
          <form
            className="grid gap-2 rounded-card border bg-card p-4"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              act(
                createAllergy({
                  patientId,
                  allergen: String(data.get("allergen")),
                  reaction: String(data.get("reaction") || "") || undefined,
                  severity:
                    (data.get("severity") as "mild" | "moderate" | "severe") ||
                    undefined,
                }),
              );
              event.currentTarget.reset();
            }}
          >
            <h2 className="font-semibold">Add allergy</h2>
            <input
              name="allergen"
              required
              aria-label="Allergen"
              placeholder="Allergen"
              className={inputClass}
            />
            <input
              name="reaction"
              aria-label="Reaction"
              placeholder="Reaction"
              className={inputClass}
            />
            <select
              name="severity"
              aria-label="Severity"
              className={inputClass}
            >
              <option value="">Severity</option>
              <option value="mild">Mild</option>
              <option value="moderate">Moderate</option>
              <option value="severe">Severe</option>
            </select>
            <button className="w-fit rounded-full border px-3 py-1.5">
              Add allergy
            </button>
          </form>
          <form
            className="grid gap-2 rounded-card border bg-card p-4"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              act(
                createMedication({
                  patientId,
                  name: String(data.get("name")),
                  dose: String(data.get("dose") || "") || undefined,
                  route: String(data.get("route") || "") || undefined,
                  frequency: String(data.get("frequency") || "") || undefined,
                }),
              );
              event.currentTarget.reset();
            }}
          >
            <h2 className="font-semibold">Add medication</h2>
            <input
              name="name"
              required
              aria-label="Medication name"
              placeholder="Medication name"
              className={inputClass}
            />
            <input
              name="dose"
              aria-label="Dose"
              placeholder="Dose"
              className={inputClass}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                name="route"
                aria-label="Route"
                placeholder="Route"
                className={inputClass}
              />
              <input
                name="frequency"
                aria-label="Frequency"
                placeholder="Frequency"
                className={inputClass}
              />
            </div>
            <button className="w-fit rounded-full border px-3 py-1.5">
              Add medication
            </button>
          </form>
        </div>
      </PermissionGate>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <ClinicalTable
        title="Allergies"
        rows={lists.allergies.map((item) => ({
          id: item._id,
          name: item.allergen,
          details: [item.reaction, item.severity].filter(Boolean).join(" · "),
          status: item.status,
          reconciliation: item.reconciliationStatus,
          patientReported: item.patientReported,
          onConfirm:
            item.reconciliationStatus === "pending"
              ? () =>
                  act(
                    reconcileAllergy({
                      allergyId: item._id,
                      status: "confirmed",
                      reason: "Clinician reconciliation",
                    }),
                  )
              : undefined,
          onReject:
            item.reconciliationStatus === "pending"
              ? () =>
                  act(
                    reconcileAllergy({
                      allergyId: item._id,
                      status: "rejected",
                      reason: "Clinician reconciliation",
                    }),
                  )
              : undefined,
          onToggle: () => {
            const reason = window.prompt("Reason for status change?");
            if (reason)
              act(
                setAllergyStatus({
                  allergyId: item._id,
                  status: item.status === "active" ? "inactive" : "active",
                  reason,
                }),
              );
          },
        }))}
      />
      <ClinicalTable
        title="Medications"
        rows={lists.medications.map((item) => ({
          id: item._id,
          name: item.name,
          details: [item.dose, item.route, item.frequency]
            .filter(Boolean)
            .join(" · "),
          status: item.status,
          reconciliation: item.reconciliationStatus,
          patientReported: item.patientReported,
          onConfirm:
            item.reconciliationStatus === "pending"
              ? () =>
                  act(
                    reconcileMedication({
                      medicationId: item._id,
                      status: "confirmed",
                      reason: "Clinician reconciliation",
                    }),
                  )
              : undefined,
          onReject:
            item.reconciliationStatus === "pending"
              ? () =>
                  act(
                    reconcileMedication({
                      medicationId: item._id,
                      status: "rejected",
                      reason: "Clinician reconciliation",
                    }),
                  )
              : undefined,
          onToggle: () => {
            const reason = window.prompt("Reason for status change?");
            if (reason)
              act(
                setMedicationStatus({
                  medicationId: item._id,
                  status: item.status === "active" ? "inactive" : "active",
                  reason,
                }),
              );
          },
        }))}
      />
    </div>
  );
}

function ClinicalTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    id: string;
    name: string;
    details: string;
    status: string;
    reconciliation: string;
    patientReported: boolean;
    onConfirm?: () => void;
    onReject?: () => void;
    onToggle: () => void;
  }>;
}) {
  return (
    <div>
      <h2 className="font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2">None recorded.</p>
      ) : (
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Name</th>
              <th>Details</th>
              <th>Source</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b">
                <td className="py-2">{row.name}</td>
                <td>{row.details || "—"}</td>
                <td>
                  {row.patientReported ? "Patient reported" : "Clinician"} ·{" "}
                  {row.reconciliation}
                </td>
                <td>{row.status}</td>
                <td className="space-x-1">
                  <PermissionGate capability="clinical.manage">
                    {row.onConfirm && (
                      <button
                        type="button"
                        onClick={row.onConfirm}
                        className="rounded-full border px-2 py-1"
                      >
                        Confirm
                      </button>
                    )}
                    {row.onReject && (
                      <button
                        type="button"
                        onClick={row.onReject}
                        className="rounded-full border px-2 py-1"
                      >
                        Reject
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={row.onToggle}
                      className="rounded-full border px-2 py-1"
                    >
                      {row.status === "active"
                        ? "Make historical"
                        : "Reactivate"}
                    </button>
                  </PermissionGate>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function DiagnosesSection({ patientId }: { patientId: Id<"patients"> }) {
  const diagnoses = useQuery(api.domains.clinical.listDiagnoses, { patientId });
  const create = useMutation(api.domains.clinical.createDiagnosis);
  const setStatus = useMutation(api.domains.clinical.setDiagnosisStatus);
  const [search, setSearch] = useState("");
  const catalog = useQuery(api.domains.clinical.searchDiagnosisCatalog, {
    search,
  });
  const [error, setError] = useState<string | null>(null);
  if (diagnoses === undefined) return <p role="status">Loading diagnoses…</p>;
  return (
    <div>
      <label className="text-sm">
        Search approved diagnosis catalog
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className={`mt-1 block w-full max-w-lg ${inputClass}`}
        />
      </label>
      {search && (
        <ul className="mt-2 max-w-lg rounded border bg-card p-2">
          {catalog?.map((item) => (
            <li
              key={item.code}
              className="flex items-center justify-between gap-2 py-1"
            >
              <span>
                {item.code} — {item.display}
              </span>
              <button
                type="button"
                className="rounded-full border px-2 py-1"
                onClick={() => {
                  setError(null);
                  void create({ patientId, ...item }).catch((cause) =>
                    setError(
                      cause instanceof Error ? cause.message : "Could not add",
                    ),
                  );
                  setSearch("");
                }}
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-destructive">
          {error}
        </p>
      )}
      {diagnoses.length === 0 ? (
        <p className="mt-4">No diagnoses recorded.</p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Code</th>
              <th>Diagnosis</th>
              <th>Status</th>
              <th>History</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {diagnoses.map((item) => (
              <tr key={item._id} className="border-b">
                <td className="py-2">{item.code}</td>
                <td>{item.display}</td>
                <td>{item.status}</td>
                <td>{item.events.length} event(s)</td>
                <td>
                  {item.status === "active" && (
                    <button
                      type="button"
                      className="rounded-full border px-2 py-1"
                      onClick={() => {
                        const reason = window.prompt("Reason for resolution?");
                        if (reason)
                          void setStatus({
                            diagnosisId: item._id,
                            status: "resolved",
                            reason,
                          });
                      }}
                    >
                      Resolve…
                    </button>
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

export function TreatmentPlansSection({
  patientId,
}: {
  patientId: Id<"patients">;
}) {
  const plans = useQuery(api.domains.clinical.listTreatmentPlans, {
    patientId,
  });
  const create = useMutation(api.domains.clinical.createTreatmentPlan);
  const activate = useMutation(api.domains.clinical.activateTreatmentPlan);
  const revise = useMutation(api.domains.clinical.reviseTreatmentPlan);
  const [error, setError] = useState<string | null>(null);
  if (plans === undefined) return <p role="status">Loading treatment plans…</p>;
  return (
    <div>
      <form
        className="grid max-w-xl gap-2 rounded-card border bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setError(null);
          void create({
            patientId,
            title: String(data.get("title")),
            followUp: String(data.get("followUp") || "") || undefined,
            goals: [
              {
                text: String(data.get("goal")),
                patientVisible: data.get("goalVisible") === "on",
              },
            ],
            actions: [
              {
                text: String(data.get("action")),
                kind: "other",
                patientVisible: data.get("actionVisible") === "on",
              },
            ],
          }).catch((cause) =>
            setError(
              cause instanceof Error ? cause.message : "Could not create",
            ),
          );
          event.currentTarget.reset();
        }}
      >
        <h2 className="font-semibold">New treatment plan</h2>
        <input
          name="title"
          required
          placeholder="Plan title"
          className={inputClass}
        />
        <input name="goal" required placeholder="Goal" className={inputClass} />
        <label className="text-sm">
          <input name="goalVisible" type="checkbox" /> Patient can see goal
        </label>
        <input
          name="action"
          required
          placeholder="Action"
          className={inputClass}
        />
        <label className="text-sm">
          <input name="actionVisible" type="checkbox" /> Patient can see action
        </label>
        <input
          name="followUp"
          placeholder="Follow-up timing"
          className={inputClass}
        />
        <button className="w-fit rounded-full border px-3 py-1.5">
          Create draft
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-destructive">
          {error}
        </p>
      )}
      <div className="mt-4 space-y-3">
        {plans.map((plan) => {
          const latest = plan.versions[0];
          return (
            <article key={plan._id} className="rounded-card border p-4">
              <h2 className="font-semibold">{plan.title}</h2>
              <p>
                Version {latest?.version} · {latest?.status}
              </p>
              <ul className="mt-1 list-disc pl-5">
                {latest?.goals.map((goal) => (
                  <li key={goal._id}>
                    {goal.text}
                    {goal.patientVisible ? " (patient visible)" : ""}
                  </li>
                ))}
                {latest?.actions.map((action) => (
                  <li key={action._id}>
                    {action.text}
                    {action.patientVisible ? " (patient visible)" : ""}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                {latest?.status === "draft" ? (
                  <button
                    type="button"
                    className="rounded-full border px-3 py-1"
                    onClick={() => void activate({ versionId: latest._id })}
                  >
                    Activate
                  </button>
                ) : latest ? (
                  <button
                    type="button"
                    className="rounded-full border px-3 py-1"
                    onClick={() =>
                      void revise({
                        planId: plan._id,
                        followUp: latest.followUp,
                        goals: latest.goals.map(({ text, patientVisible }) => ({
                          text,
                          patientVisible,
                        })),
                        actions: latest.actions.map(
                          ({
                            text,
                            kind,
                            linkedMedicationId,
                            patientVisible,
                          }) => ({
                            text,
                            kind,
                            linkedMedicationId,
                            patientVisible,
                          }),
                        ),
                      })
                    }
                  >
                    Create revision
                  </button>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {plan.versions.length} preserved version(s)
              </p>
            </article>
          );
        })}
        {plans.length === 0 && <p>No treatment plans yet.</p>}
      </div>
    </div>
  );
}

export function EncountersSection({
  patientId,
}: {
  patientId: Id<"patients">;
}) {
  const encounters = useQuery(api.domains.encounters.listForPatient, {
    patientId,
  });
  const appointments = useQuery(api.domains.appointments.listForPatient, {
    patientId,
  });
  const start = useMutation(api.domains.encounters.startEncounter);
  const [error, setError] = useState<string | null>(null);
  if (encounters === undefined || appointments === undefined) {
    return <p role="status">Loading encounters…</p>;
  }
  const startedAppointments = new Set(
    encounters.map((item) => item.appointmentId),
  );
  return (
    <div>
      <PermissionGate capability="encounter.write">
        <h2 className="font-semibold">Eligible appointments</h2>
        <ul className="mt-2 space-y-2">
          {appointments
            .filter(
              (item) =>
                !startedAppointments.has(item._id) &&
                ["scheduled", "confirmed", "checkedIn", "inProgress"].includes(
                  item.status,
                ),
            )
            .map((item) => (
              <li key={item._id} className="flex justify-between border-b py-2">
                <span>
                  {item.date} {item.localTime} · {item.appointmentTypeName}
                </span>
                <button
                  type="button"
                  className="rounded-full border px-3 py-1"
                  onClick={() => {
                    setError(null);
                    void start({
                      appointmentId: item._id,
                      type: item.appointmentTypeName,
                    }).catch((cause) =>
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : "Could not start",
                      ),
                    );
                  }}
                >
                  Start encounter
                </button>
              </li>
            ))}
        </ul>
      </PermissionGate>
      {error && (
        <p role="alert" className="mt-2 text-destructive">
          {error}
        </p>
      )}
      <h2 className="mt-5 font-semibold">Encounter history</h2>
      {encounters.length === 0 ? (
        <p className="mt-2">No encounters yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {encounters.map((item) => (
            <li key={item._id} className="border-b py-2">
              <Link to={`/app/encounters/${item._id}`} className="underline">
                {item.type} · {new Date(item.startedAt).toLocaleDateString()}
              </Link>{" "}
              · {item.status} · {item.providerName}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
