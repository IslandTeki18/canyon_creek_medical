import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Answers, FormDefinition } from "../../../convex/lib/forms";
import {
  formDraftSchema,
  listDefinitionProblems,
} from "../../../convex/lib/forms";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { EditorShell, RailGroup } from "../../components/ui/editor-shell";
import { ReasonDialog } from "../../components/ui/reason-dialog";
import { FormRenderer } from "../intake/form-renderer";
import { useAuthConfigured } from "../../lib/auth";
import { FormBuilder } from "./form-builder.tsx";
import { numberFields } from "./form-builder";
import {
  AutosaveBanner,
  AutosaveStatus,
  useAutosave,
  useUnsavedGuard,
} from "./use-autosave";

export default function FormTemplateDetailPage() {
  const configured = useAuthConfigured();
  const { templateId } = useParams();
  if (!configured || !templateId) {
    return (
      <section>
        <h1 className="font-display text-3xl">Form template</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Authentication is not configured in this environment.
        </p>
      </section>
    );
  }
  return <TemplateDetail templateId={templateId as Id<"formTemplates">} />;
}

function TemplateDetail({ templateId }: { templateId: Id<"formTemplates"> }) {
  const detail = useQuery(api.domains.forms.getTemplate, { templateId });
  const createDraft = useMutation(api.domains.forms.createDraftVersion);
  const setStatus = useMutation(api.domains.forms.setTemplateStatus);
  const [error, setError] = useState<string | null>(null);

  if (detail === undefined) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading template…
      </p>
    );
  }
  if (detail === null) {
    return <p className="text-sm text-muted-foreground">Template not found.</p>;
  }
  const { template, versions } = detail;
  const draft = versions.find((v) => v.status === "draft");
  const retiring = template.status === "active";

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  return (
    <section>
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link to="/admin/forms" className="underline">
          Form templates
        </Link>{" "}
        / {template.name}
      </nav>
      <div className="mt-2 flex items-center gap-3">
        <h1 className="font-display text-3xl">{template.name}</h1>
        <span className="rounded-full bg-card px-2 py-0.5 text-xs">
          {template.type} · {template.status}
        </span>
      </div>

      <div className="mt-3 flex gap-2">
        {!draft && template.status === "active" && (
          <button
            type="button"
            onClick={() => run(() => createDraft({ templateId }))}
            className="rounded-full border px-3 py-1.5 text-sm"
          >
            New draft version
          </button>
        )}
        <ReasonDialog
          title={retiring ? "Retire this template?" : "Restore this template?"}
          description={
            retiring
              ? "Retired templates cannot be assigned. Existing assignments are unaffected."
              : "The template becomes assignable again."
          }
          confirmLabel={retiring ? "Retire" : "Restore"}
          confirmVariant={retiring ? "destructive" : "default"}
          trigger={
            <button
              type="button"
              className="rounded-full border px-3 py-1.5 text-sm"
            >
              {retiring ? "Retire" : "Restore"}
            </button>
          }
          onConfirm={(reason) =>
            setStatus({
              templateId,
              status: retiring ? "retired" : "active",
              reason,
            })
          }
        />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {draft && (
        <DraftEditor
          draftId={draft._id}
          definition={draft.definition}
          updatedAt={draft.updatedAt}
          template={template}
        />
      )}

      <h2 className="mt-8 font-semibold">Version history</h2>
      <table className="mt-2 w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Version</th>
            <th>Status</th>
            <th>Published</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => (
            <tr key={v._id} className="border-b">
              <td className="py-2">v{v.version}</td>
              <td>{v.status}</td>
              <td>
                {v.publishedAt ? new Date(v.publishedAt).toLocaleString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function summarize(def: FormDefinition): string {
  const fields = def.sections.flatMap((s) => s.fields);
  return `${def.sections.length} section(s), ${fields.length} field(s), ${
    fields.filter((f) => f.required).length
  } required`;
}

export function DraftEditor({
  draftId,
  definition,
  updatedAt,
  template,
}: {
  draftId: Id<"formVersions">;
  definition: FormDefinition;
  updatedAt: number;
  template: { name: string; type: string; status: string };
}) {
  const saveDraft = useMutation(api.domains.forms.saveDraftDefinition);
  const publish = useMutation(api.domains.forms.publishVersion);
  const [draft, setDraft] = useState(definition);
  const [text, setText] = useState(() => JSON.stringify(definition, null, 2));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishProblems, setPublishProblems] = useState<
    { path: string; message: string }[]
  >([]);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [previewAnswers, setPreviewAnswers] = useState<Answers>({});
  const autosave = useAutosave({
    enabled: true,
    value: draft,
    save: (value) => saveDraft({ versionId: draftId, definition: value }),
  });
  const unsavedGuard = useUnsavedGuard(autosave.dirty);

  function change(next: FormDefinition, structural: boolean) {
    setDraft(next);
    setText(JSON.stringify(next, null, 2));
    setError(null);
    if (structural) void autosave.flushNow(next);
  }

  function applyJson() {
    try {
      const next = formDraftSchema.parse(JSON.parse(text));
      setDraft(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
    }
  }

  async function onPublish() {
    setError(null);
    setMessage(null);
    await autosave.flushNow();
    setPublishProblems(listDefinitionProblems(draft));
    setPublishOpen(true);
  }

  async function confirmPublish() {
    setPublishError(null);
    try {
      await publish({ versionId: draftId });
      setMessage("Published.");
      setPublishOpen(false);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Could not publish");
    }
  }

  const numericFields = numberFields(draft);
  const scoring = draft.scoreRule !== undefined;

  return (
    <div className="mt-6" onBlur={() => void autosave.flushNow()}>
      {unsavedGuard}
      <AutosaveBanner
        status={autosave.status}
        savingSince={autosave.savingSince}
        error={autosave.error}
        onCopy={() => void navigator.clipboard.writeText(text)}
      />
      <EditorShell
        topBar={
          <>
            <h2 className="mr-auto font-display text-2xl">Draft editor</h2>
            <AutosaveStatus
              status={autosave.status}
              savedAt={autosave.lastSavedAt ?? updatedAt}
            />
            <button
              type="button"
              onClick={() => void onPublish()}
              className="rounded-full bg-primary px-3 py-1.5 text-sm text-primary-foreground"
            >
              Publish…
            </button>
          </>
        }
        rail={
          <>
            <RailGroup title="Template">
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Name</dt>
                  <dd>{template.name}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Type</dt>
                  <dd>{template.type}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>{template.status}</dd>
                </div>
              </dl>
            </RailGroup>
            <RailGroup title="Scoring">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scoring}
                  onChange={(event) =>
                    change(
                      {
                        ...draft,
                        scoreRule: event.target.checked
                          ? { type: "sum", fields: [] }
                          : undefined,
                      },
                      true,
                    )
                  }
                />
                Add up number fields
              </label>
              {scoring &&
                (numericFields.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Add a number question to score this form.
                  </p>
                ) : (
                  numericFields.map((field) => (
                    <label
                      key={field.key}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={draft.scoreRule?.fields.includes(field.key)}
                        onChange={(event) => {
                          const fields = draft.scoreRule?.fields ?? [];
                          change(
                            {
                              ...draft,
                              scoreRule: {
                                type: "sum",
                                fields: event.target.checked
                                  ? [...fields, field.key]
                                  : fields.filter((key) => key !== field.key),
                              },
                            },
                            true,
                          );
                        }}
                      />
                      {field.label || field.key}
                    </label>
                  ))
                ))}
            </RailGroup>
          </>
        }
      >
        <FormBuilder definition={draft} onChange={change} />
        <div className="mt-8">
          <h3 className="font-semibold">Preview</h3>
          <div className="mt-2">
            <FormRenderer
              definition={draft}
              answers={previewAnswers}
              onChange={(key, value) =>
                setPreviewAnswers((answers) => ({ ...answers, [key]: value }))
              }
            />
          </div>
        </div>
        <details className="mt-8">
          <summary className="cursor-pointer text-sm font-medium">
            Advanced: Edit as JSON
          </summary>
          <textarea
            aria-label="Draft form definition (JSON)"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onBlur={applyJson}
            rows={18}
            spellCheck={false}
            className="mt-2 w-full rounded border p-2 font-mono text-xs"
          />
        </details>
        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="mt-2 text-sm text-green-700">
            {message}
          </p>
        )}
        <AlertDialog
          open={publishOpen}
          onOpenChange={(open) => {
            setPublishOpen(open);
            if (!open) setPublishError(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogTitle>
              {publishProblems.length > 0
                ? "Fix this draft before publishing"
                : "Publish this version?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {publishProblems.length > 0
                ? "Every section and question must be complete."
                : `${summarize(draft)}. The published version becomes immutable and is used for all new assignments.`}
            </AlertDialogDescription>
            {publishProblems.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                {publishProblems.map((problem, index) => (
                  <li key={`${problem.path}:${problem.message}:${index}`}>
                    {problem.path ? (
                      <a href={`#${problem.path}`} className="underline">
                        {problem.message}
                      </a>
                    ) : (
                      problem.message
                    )}
                  </li>
                ))}
              </ul>
            )}
            {publishError && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {publishError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <AlertDialogCancel asChild>
                <Button variant="outline">Cancel</Button>
              </AlertDialogCancel>
              {publishProblems.length === 0 && (
                <AlertDialogAction asChild>
                  <Button
                    onClick={(event) => {
                      event.preventDefault();
                      void confirmPublish();
                    }}
                  >
                    Publish version
                  </Button>
                </AlertDialogAction>
              )}
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </EditorShell>
    </div>
  );
}
