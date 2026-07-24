import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Answers, AnswerValue } from "../../../convex/lib/forms";
import { FormRenderer } from "../intake/form-renderer";

/** List of available forms with response status. */
export default function PortalFormsPage() {
  const forms = useQuery(api.domains.intake.listMyForms, {});
  const start = useMutation(api.domains.intake.startMyResponse);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  if (forms === undefined) {
    return (
      <p role="status" className="text-sm text-neutral-500">
        Loading your forms…
      </p>
    );
  }
  return (
    <section>
      <h1 className="text-2xl font-semibold">Forms</h1>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {forms.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">
          No forms are available right now.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {forms.map((f) => (
            <li
              key={f.templateId}
              className="flex items-center justify-between rounded border p-3"
            >
              <div>
                <p className="text-sm font-medium">{f.name}</p>
                <p className="text-xs text-neutral-500">
                  {f.responseStatus === "submitted"
                    ? "Completed"
                    : f.responseStatus === "draft"
                      ? "In progress"
                      : "Not started"}
                </p>
              </div>
              {f.responseStatus !== "submitted" && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    start({ templateId: f.templateId })
                      .then((responseId) =>
                        navigate(`/portal/forms/${responseId}`),
                      )
                      .catch(() => setError("Could not open this form."));
                  }}
                  className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
                >
                  {f.responseStatus === "draft" ? "Resume" : "Start"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Fill/resume/submit a single form response. */
export function PortalFormFillPage() {
  const { responseId } = useParams();
  if (!responseId) return null;
  return <FormFill responseId={responseId as Id<"formResponses">} />;
}

function FormFill({ responseId }: { responseId: Id<"formResponses"> }) {
  const data = useQuery(api.domains.intake.getMyResponse, { responseId });
  const saveDraft = useMutation(api.domains.intake.saveMyDraft);
  const submit = useMutation(api.domains.intake.submitMyResponse);
  const restart = useMutation(api.domains.intake.restartMyResponse);
  const navigate = useNavigate();

  const [answers, setAnswers] = useState<Answers | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  // Load server answers once; afterwards local state is the source of truth.
  useEffect(() => {
    if (data && !loaded.current) {
      loaded.current = true;
      setAnswers(data.response.answers as Answers);
    }
  }, [data]);

  if (data === undefined || answers === null) {
    return (
      <p role="status" className="text-sm text-neutral-500">
        Loading form…
      </p>
    );
  }
  if (data.response.status === "submitted") {
    return (
      <section>
        <h1 className="text-2xl font-semibold">{data.templateName}</h1>
        <p className="mt-2 text-sm text-green-700">
          This form has been submitted. Thank you.
        </p>
        <Link
          to="/portal/forms"
          className="mt-2 inline-block text-sm underline"
        >
          Back to forms
        </Link>
      </section>
    );
  }
  if (!data.versionCurrent) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">{data.templateName}</h1>
        <p className="mt-2 text-sm">
          This form was updated while you were filling it out. Your compatible
          answers will be kept.
        </p>
        <button
          type="button"
          onClick={() => {
            restart({ responseId })
              .then(() => {
                loaded.current = false;
                setAnswers(null);
              })
              .catch(() => setError("Could not reload the form."));
          }}
          className="mt-3 rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
        >
          Continue on the new version
        </button>
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </section>
    );
  }

  function onChange(key: string, value: AnswerValue) {
    setAnswers((a) => ({ ...a!, [key]: value }));
    setStatus(null);
  }

  async function onSave() {
    setError(null);
    setStatus("Saving…");
    try {
      await saveDraft({ responseId, answers: answers! });
      setStatus("Draft saved.");
    } catch {
      setStatus(null);
      setError("Could not save your draft.");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    try {
      const result = await submit({ responseId, answers: answers! });
      if (result.submitted) {
        navigate("/portal/forms");
      } else {
        setFieldErrors(
          Object.fromEntries(result.errors.map((er) => [er.key, er.message])),
        );
        setError("Please fix the highlighted answers.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not submit the form.",
      );
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold">{data.templateName}</h1>
      <form onSubmit={onSubmit} className="mt-4 max-w-lg">
        <FormRenderer
          definition={data.definition}
          answers={answers}
          onChange={onChange}
          errors={fieldErrors}
        />
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {status && (
          <p role="status" className="mt-3 text-sm text-neutral-600">
            {status}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => void onSave()}
            className="rounded border px-3 py-1.5 text-sm"
          >
            Save draft
          </button>
          <button
            type="submit"
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
          >
            Submit
          </button>
        </div>
      </form>
    </section>
  );
}
