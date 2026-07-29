import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";

export default function ClinicalReviewQueuePage() {
  const queue = useQuery(api.domains.clinical.listReviewQueue, {});
  const reconcileAllergy = useMutation(api.domains.clinical.reconcileAllergy);
  const reconcileMedication = useMutation(
    api.domains.clinical.reconcileMedication,
  );
  if (queue === undefined) return <p role="status">Loading review queue…</p>;
  const rows = [
    ...queue.allergies.map((item) => ({
      id: item._id,
      patientId: item.patientId,
      kind: "Allergy",
      name: item.allergen,
      resolve: (status: "confirmed" | "rejected") =>
        reconcileAllergy({
          allergyId: item._id,
          status,
          reason: "Clinician queue review",
        }),
    })),
    ...queue.medications.map((item) => ({
      id: item._id,
      patientId: item.patientId,
      kind: "Medication",
      name: item.name,
      resolve: (status: "confirmed" | "rejected") =>
        reconcileMedication({
          medicationId: item._id,
          status,
          reason: "Clinician queue review",
        }),
    })),
  ];
  return (
    <section>
      <h1 className="font-display text-3xl">Clinical reconciliation</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Patient-reported allergy and medication changes awaiting human review.
      </p>
      {rows.length === 0 ? (
        <p className="mt-4">No reports awaiting review.</p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Patient</th>
              <th>Type</th>
              <th>Reported item</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b">
                <td className="py-2">
                  <Link
                    to={`/app/patients/${row.patientId}`}
                    className="underline"
                  >
                    Open chart
                  </Link>
                </td>
                <td>{row.kind}</td>
                <td>{row.name}</td>
                <td className="space-x-1">
                  <button
                    type="button"
                    className="rounded-full border px-2 py-1"
                    onClick={() => void row.resolve("confirmed")}
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    className="rounded-full border px-2 py-1"
                    onClick={() => void row.resolve("rejected")}
                  >
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
