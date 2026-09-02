import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { NoteSections } from "../../../convex/domains/encounters";
import { EVALUATION_SECTIONS } from "../../../convex/domains/psychiatricEvaluations";

const SECTION_LABELS: Array<[keyof NoteSections, string]> = [
  ["history", "History"],
  ["assessment", "Assessment"],
  ["plan", "Plan"],
  ["risk", "Risk"],
  ["education", "Education"],
  ["followUp", "Follow-up"],
];

export default function EncounterDetailPage() {
  const { encounterId } = useParams();
  if (!encounterId) return <p>Encounter not found.</p>;
  return <EncounterDetail encounterId={encounterId as Id<"encounters">} />;
}

function EncounterDetail({ encounterId }: { encounterId: Id<"encounters"> }) {
  const detail = useQuery(api.domains.encounters.getEncounter, { encounterId });
  const recordAccess = useMutation(api.domains.encounters.recordAccess);

  useEffect(() => {
    void recordAccess({ encounterId });
  }, [encounterId, recordAccess]);

  if (detail === undefined) return <p role="status">Loading encounter…</p>;
  if (detail === null) return <p>Encounter not found.</p>;
  return (
    <section>
      <nav className="text-sm text-muted-foreground">
        <Link
          to={`/app/patients/${detail.encounter.patientId}`}
          className="underline"
        >
          Patient chart
        </Link>{" "}
        / Encounter
      </nav>
      <h1 className="mt-2 font-display text-3xl">{detail.encounter.type}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {detail.encounter.status} · started{" "}
        {new Date(detail.encounter.startedAt).toLocaleString()}
      </p>
      {detail.draft ? (
        <>
          <DraftEditor encounterId={encounterId} draft={detail.draft} />
          <PsychiatricEvaluationEditor encounterId={encounterId} />
        </>
      ) : detail.signed ? (
        <SignedNote
          encounterId={encounterId}
          signed={detail.signed}
          amendments={detail.amendments}
        />
      ) : null}
      {detail.encounter.status !== "draft" && (
        <SummaryEditor
          encounterId={encounterId}
          patientId={detail.encounter.patientId}
          summary={detail.summary}
          versions={detail.summaryVersions}
        />
      )}
    </section>
  );
}

const EVALUATION_LABELS: Record<(typeof EVALUATION_SECTIONS)[number], string> =
  {
    presentingConcern: "Presenting concern",
    psychiatricHistory: "Mental health history",
    medicalHistory: "Medical history",
    familyHistory: "Family history",
    medicationHistory: "Medication history",
    substanceUse: "Substance use",
    sleep: "Sleep",
    lifestyle: "Lifestyle",
    trauma: "Trauma",
    mentalStatus: "Mental status (provider only)",
    riskAssessment: "Risk assessment (provider only)",
    formulation: "Formulation (provider only)",
    plan: "Plan (provider only)",
  };

function PsychiatricEvaluationEditor({
  encounterId,
}: {
  encounterId: Id<"encounters">;
}) {
  const configs = useQuery(
    api.domains.psychiatricEvaluations.listActiveConfigs,
    {},
  );
  const data = useQuery(api.domains.psychiatricEvaluations.getForEncounter, {
    encounterId,
  });
  const save = useMutation(api.domains.psychiatricEvaluations.save);
  const [configId, setConfigId] =
    useState<Id<"psychiatricEvaluationConfigs"> | null>(null);
  const [sections, setSections] = useState<Record<string, string>>({});
  const [patientReported, setPatientReported] = useState<string[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (data) {
      setConfigId(data.evaluation.configId);
      setSections(data.evaluation.sections as Record<string, string>);
      setPatientReported(data.evaluation.patientReportedSections);
    }
  }, [data]);

  if (configs === undefined || data === undefined)
    return <p role="status">Loading evaluation template…</p>;
  if (configs.length === 0 && !data) return null;
  const selectedConfig =
    configs.find((config) => config._id === configId) ?? data?.config;
  return (
    <section className="mt-8 border-t pt-6">
      <h2 className="text-xl font-semibold">
        Initial mental health evaluation
      </h2>
      {!data && (
        <select
          aria-label="Evaluation template"
          className="mt-2 rounded border px-3 py-2"
          value={configId ?? ""}
          onChange={(event) =>
            setConfigId(
              event.target.value as Id<"psychiatricEvaluationConfigs">,
            )
          }
        >
          <option value="">Select an approved template</option>
          {configs.map((config) => (
            <option key={config._id} value={config._id}>
              {config.name}
            </option>
          ))}
        </select>
      )}
      {selectedConfig && (
        <div className="mt-3 grid gap-4">
          {EVALUATION_SECTIONS.map((key) => (
            <label key={key} className="text-sm font-medium">
              {EVALUATION_LABELS[key]}
              {selectedConfig.requiredSections.includes(key) ? " *" : ""}
              <textarea
                rows={3}
                value={sections[key] ?? ""}
                onChange={(event) =>
                  setSections({ ...sections, [key]: event.target.value })
                }
                className="mt-1 block w-full rounded border px-3 py-2"
              />
              {![
                "mentalStatus",
                "riskAssessment",
                "formulation",
                "plan",
              ].includes(key) && (
                <span className="mt-1 block font-normal">
                  <input
                    type="checkbox"
                    checked={patientReported.includes(key)}
                    onChange={(event) =>
                      setPatientReported(
                        event.target.checked
                          ? [...patientReported, key]
                          : patientReported.filter((item) => item !== key),
                      )
                    }
                  />{" "}
                  Patient-reported
                </span>
              )}
            </label>
          ))}
          <button
            type="button"
            className="w-fit rounded-full border px-4 py-2"
            onClick={() => {
              if (!configId) return;
              setStatus("Saving…");
              void save({
                encounterId,
                configId,
                expectedRevision: data?.evaluation.revision ?? 0,
                sections,
                patientReportedSections: patientReported,
                medicationIds: data?.evaluation.medicationIds ?? [],
                diagnosisIds: data?.evaluation.diagnosisIds ?? [],
                assessmentResponseIds:
                  data?.evaluation.assessmentResponseIds ?? [],
              })
                .then(() => setStatus("Saved"))
                .catch((cause) =>
                  setStatus(
                    cause instanceof Error ? cause.message : "Save failed",
                  ),
                );
            }}
          >
            Save evaluation
          </button>
          <p role="status">{status}</p>
          <p className="text-xs text-muted-foreground">
            Medications, diagnoses, and assessment responses remain linked
            records; they are not copied into this note.
          </p>
        </div>
      )}
    </section>
  );
}

function DraftEditor({
  encounterId,
  draft,
}: {
  encounterId: Id<"encounters">;
  draft: {
    revision: number;
    sections: NoteSections;
    updatedAt: number;
  };
}) {
  const saveDraft = useMutation(api.domains.encounters.saveDraft);
  const sign = useMutation(api.domains.encounters.signEncounter);
  const [sections, setSections] = useState(draft.sections);
  const [revision, setRevision] = useState(draft.revision);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("Saved");
  const [signatureName, setSignatureName] = useState("");

  useEffect(() => {
    if (!dirty && draft.revision !== revision) {
      setSections(draft.sections);
      setRevision(draft.revision);
    }
  }, [dirty, draft, revision]);

  async function save() {
    if (!dirty) return;
    setStatus("Saving…");
    try {
      const result = await saveDraft({
        encounterId,
        expectedRevision: revision,
        sections,
      });
      setRevision(result.revision);
      setDirty(false);
      setStatus("Saved");
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Save failed");
    }
  }

  return (
    <div className="mt-6">
      <div
        className="grid gap-4"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) void save();
        }}
      >
        {SECTION_LABELS.map(([key, label]) => (
          <label key={key} className="text-sm font-medium">
            {label}
            <textarea
              rows={4}
              value={sections[key]}
              onChange={(event) => {
                setSections({ ...sections, [key]: event.target.value });
                setDirty(true);
                setStatus("Unsaved changes");
              }}
              className="mt-1 block w-full rounded border bg-card px-3 py-2 font-normal"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty}
          className="rounded-full border px-4 py-2 disabled:opacity-50"
        >
          Save
        </button>
        <span role="status" className="text-sm text-muted-foreground">
          {status} · revision {revision}
        </span>
      </div>
      <div className="mt-6 rounded-card border p-4">
        <h2 className="font-semibold">Sign and lock</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          History, assessment, and plan are required. Signing permanently locks
          this snapshot.
        </p>
        <input
          value={signatureName}
          onChange={(event) => setSignatureName(event.target.value)}
          placeholder="Type your account name"
          aria-label="Signature name"
          className="mt-3 rounded-full border px-3 py-1.5"
        />
        <button
          type="button"
          disabled={dirty || !signatureName.trim()}
          className="ml-2 rounded-full bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          onClick={() => {
            if (
              window.confirm(
                "Sign this encounter? The signed note cannot be edited.",
              )
            ) {
              void sign({ encounterId, signatureName }).catch((cause) =>
                setStatus(
                  cause instanceof Error ? cause.message : "Could not sign",
                ),
              );
            }
          }}
        >
          Sign encounter
        </button>
      </div>
    </div>
  );
}

function SignedNote({
  encounterId,
  signed,
  amendments,
}: {
  encounterId: Id<"encounters">;
  signed: {
    sections: NoteSections;
    signerDisplayName: string;
    signedAt: number;
  };
  amendments: Array<{
    _id: string;
    reason: string;
    content: string;
    authorDisplayName: string;
    signedAt: number;
  }>;
}) {
  const addAmendment = useMutation(api.domains.encounters.addAmendment);
  const [reason, setReason] = useState("");
  const [content, setContent] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-6">
      <article className="rounded-card border bg-card p-5">
        <h2 className="font-semibold">Signed note</h2>
        {SECTION_LABELS.map(([key, label]) => (
          <section key={key} className="mt-4">
            <h3 className="text-sm font-semibold">{label}</h3>
            <p className="mt-1 whitespace-pre-wrap">
              {signed.sections[key] || "—"}
            </p>
          </section>
        ))}
        <p className="mt-4 text-xs text-muted-foreground">
          Signed by {signed.signerDisplayName} on{" "}
          {new Date(signed.signedAt).toLocaleString()}
        </p>
      </article>
      {amendments.map((amendment) => (
        <article key={amendment._id} className="mt-3 rounded-card border p-4">
          <h2 className="font-semibold">Amendment</h2>
          <p className="mt-1 whitespace-pre-wrap">{amendment.content}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Reason: {amendment.reason} · {amendment.authorDisplayName} ·{" "}
            {new Date(amendment.signedAt).toLocaleString()}
          </p>
        </article>
      ))}
      <form
        className="mt-5 grid max-w-xl gap-2 rounded-card border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          void addAmendment({
            encounterId,
            reason,
            content,
            signatureName,
          })
            .then(() => {
              setReason("");
              setContent("");
              setSignatureName("");
            })
            .catch((cause) =>
              setError(
                cause instanceof Error ? cause.message : "Could not amend",
              ),
            );
        }}
      >
        <h2 className="font-semibold">Add signed amendment</h2>
        <input
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason for amendment"
          className="rounded-full border px-3 py-1.5"
        />
        <textarea
          required
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Amendment"
          rows={3}
          className="rounded border px-3 py-2"
        />
        <input
          required
          value={signatureName}
          onChange={(event) => setSignatureName(event.target.value)}
          placeholder="Type your account name"
          className="rounded-full border px-3 py-1.5"
        />
        <button className="w-fit rounded-full border px-3 py-1.5">
          Sign amendment
        </button>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}

function SummaryEditor({
  encounterId,
  patientId,
  summary,
  versions,
}: {
  encounterId: Id<"encounters">;
  patientId: Id<"patients">;
  summary: { _id: Id<"afterVisitSummaries"> } | null;
  versions: Array<{
    _id: Id<"afterVisitSummaryVersions">;
    version: number;
    status: "draft" | "published" | "withdrawn";
    content: string;
  }>;
}) {
  const create = useMutation(api.domains.encounters.createSummaryDraft);
  const update = useMutation(api.domains.encounters.updateSummaryDraft);
  const publish = useMutation(api.domains.encounters.publishSummary);
  const withdraw = useMutation(api.domains.encounters.withdrawSummary);
  const plans = useQuery(api.domains.clinical.listTreatmentPlans, {
    patientId,
  });
  const latest = versions[0];
  const [content, setContent] = useState(latest?.content ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(
    () => setContent(latest?.content ?? ""),
    [latest?._id, latest?.content],
  );
  const planElements =
    plans?.flatMap((plan) => {
      const active = plan.versions.find(
        (version) => version.status === "active",
      );
      if (!active) return [];
      return [...active.goals, ...active.actions].map((item) => ({
        id: item._id,
        text: item.text,
      }));
    }) ?? [];

  return (
    <div className="mt-8 border-t pt-6">
      <h2 className="text-xl font-semibold">After-visit summary</h2>
      {latest?.status === "draft" ? (
        <div className="mt-3">
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={5}
            className="w-full rounded border px-3 py-2"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded-full border px-3 py-1"
              onClick={() =>
                void update({ versionId: latest._id, content }).catch((cause) =>
                  setError(
                    cause instanceof Error ? cause.message : "Could not save",
                  ),
                )
              }
            >
              Save summary draft
            </button>
            <button
              type="button"
              className="rounded-full bg-primary px-3 py-1 text-primary-foreground"
              onClick={() => {
                if (window.confirm("Publish this summary to the patient?")) {
                  void publish({ versionId: latest._id }).catch((cause) =>
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Could not publish",
                    ),
                  );
                }
              }}
            >
              Publish
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          {latest?.status === "published" && (
            <p className="whitespace-pre-wrap rounded border p-3">
              {latest.content}
            </p>
          )}
          {!latest && planElements.length > 0 && (
            <fieldset className="mb-3 rounded border p-3">
              <legend className="text-sm font-semibold">
                Select plan elements for the draft
              </legend>
              {planElements.map((item) => (
                <label key={item.id} className="mt-1 block text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [...selected, item.id]
                          : selected.filter((id) => id !== item.id),
                      )
                    }
                  />{" "}
                  {item.text}
                </label>
              ))}
            </fieldset>
          )}
          <button
            type="button"
            className="mt-2 rounded-full border px-3 py-1"
            onClick={() =>
              void create({
                encounterId,
                content:
                  latest?.content ??
                  planElements
                    .filter((item) => selected.includes(item.id))
                    .map((item) => item.text)
                    .join("\n"),
              })
            }
          >
            {latest ? "Create correction" : "Create summary"}
          </button>
          {summary && latest?.status === "published" && (
            <button
              type="button"
              className="ml-2 rounded-full border px-3 py-1"
              onClick={() => {
                const reason = window.prompt("Reason for withdrawal?");
                if (reason) void withdraw({ summaryId: summary._id, reason });
              }}
            >
              Withdraw…
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-destructive">
          {error}
        </p>
      )}
      {versions.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {versions.length} preserved version(s)
        </p>
      )}
    </div>
  );
}
