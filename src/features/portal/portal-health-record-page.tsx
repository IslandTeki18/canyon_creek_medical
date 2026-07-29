import { useMutation, useQuery } from "convex/react";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";

export default function PortalHealthRecordPage() {
  const lists = useQuery(api.domains.clinical.listMyClinicalLists, {});
  const plans = useQuery(api.domains.clinical.listMyTreatmentPlans, {});
  const summaries = useQuery(api.domains.encounters.listMySummaries, {});
  const reportAllergy = useMutation(api.domains.clinical.reportMyAllergy);
  const reportMedication = useMutation(api.domains.clinical.reportMyMedication);
  const recordAccess = useMutation(
    api.domains.clinical.recordMyHealthRecordAccess,
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void recordAccess({});
  }, [recordAccess]);

  function submitReport(
    event: FormEvent<HTMLFormElement>,
    kind: "allergy" | "medication",
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const promise =
      kind === "allergy"
        ? reportAllergy({
            allergen: String(data.get("name")),
            reaction: String(data.get("details") || "") || undefined,
          })
        : reportMedication({
            name: String(data.get("name")),
            dose: String(data.get("details") || "") || undefined,
          });
    setMessage(null);
    void promise
      .then(() => {
        form.reset();
        setMessage("Submitted for clinician review.");
      })
      .catch(() => setMessage("Could not submit. Please try again."));
  }

  if (lists === undefined || plans === undefined || summaries === undefined) {
    return <p role="status">Loading your health record…</p>;
  }
  return (
    <section>
      <h1 className="m-0 font-display text-3xl">Health record</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Reported changes are reviewed by your care team before confirmation.
      </p>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <RecordList
          title="Allergies"
          items={lists.allergies.map((item) => ({
            id: item._id,
            name: item.allergen,
            detail: item.reaction,
            status: item.reconciliationStatus,
          }))}
        />
        <RecordList
          title="Medications"
          items={lists.medications.map((item) => ({
            id: item._id,
            name: item.name,
            detail: [item.dose, item.route, item.frequency]
              .filter(Boolean)
              .join(" · "),
            status: item.reconciliationStatus,
          }))}
        />
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {(["allergy", "medication"] as const).map((kind) => (
          <form
            key={kind}
            onSubmit={(event) => submitReport(event, kind)}
            className="grid gap-2 rounded-[28px] bg-sand-deep p-5"
          >
            <h2 className="font-display text-lg">Report a {kind} change</h2>
            <input
              name="name"
              required
              aria-label={`${kind} name`}
              placeholder={kind === "allergy" ? "Allergen" : "Medication name"}
              className="rounded-full border bg-white px-3 py-1.5"
            />
            <input
              name="details"
              aria-label={`${kind} details`}
              placeholder={kind === "allergy" ? "Reaction" : "Dose"}
              className="rounded-full border bg-white px-3 py-1.5"
            />
            <button className="w-fit rounded-full border px-3 py-1.5 text-sm">
              Submit for review
            </button>
          </form>
        ))}
      </div>
      {message && (
        <p role="status" className="mt-2 text-sm">
          {message}
        </p>
      )}

      <h2 className="mt-8 font-display text-2xl">Treatment plans</h2>
      {plans.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">
          No approved treatment-plan items are available.
        </p>
      ) : (
        plans.map((plan) => (
          <article
            key={plan.title}
            className="mt-3 rounded-[28px] bg-sand-deep p-5"
          >
            <h3 className="font-semibold">{plan.title}</h3>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {plan.goals.map((item) => (
                <li key={item._id}>{item.text}</li>
              ))}
              {plan.actions.map((item) => (
                <li key={item._id}>{item.text}</li>
              ))}
            </ul>
            {plan.followUp && (
              <p className="mt-2 text-sm">Follow-up: {plan.followUp}</p>
            )}
          </article>
        ))
      )}

      <h2 className="mt-8 font-display text-2xl">After-visit summaries</h2>
      {summaries.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">
          No summaries are available.
        </p>
      ) : (
        summaries.map((summary) => (
          <article
            key={summary._id}
            className="mt-3 rounded-[28px] bg-sand-deep p-5"
          >
            <p className="whitespace-pre-wrap">{summary.content}</p>
            <p className="mt-2 text-xs text-neutral-500">
              Published{" "}
              {summary.publishedAt
                ? new Date(summary.publishedAt).toLocaleDateString()
                : ""}
            </p>
          </article>
        ))
      )}
    </section>
  );
}

function RecordList({
  title,
  items,
}: {
  title: string;
  items: Array<{ id: string; name: string; detail?: string; status: string }>;
}) {
  return (
    <div className="rounded-[28px] bg-sand-deep p-5">
      <h2 className="font-display text-lg">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">None recorded.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {items.map((item) => (
            <li key={item.id}>
              {item.name}
              {item.detail ? ` — ${item.detail}` : ""}{" "}
              <span className="text-neutral-500">({item.status})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
