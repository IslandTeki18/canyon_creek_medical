import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Answers, FormDefinition } from "../../../convex/lib/forms";
import { parseDefinition } from "../../../convex/lib/forms";
import { FormRenderer } from "../intake/form-renderer";
import { useAuthConfigured } from "../../lib/auth";

export default function FormTemplateDetailPage() {
  const configured = useAuthConfigured();
  const { templateId } = useParams();
  if (!configured || !templateId) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">Form template</h1>
        <p className="mt-2 text-sm text-neutral-500">
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
      <p role="status" className="text-sm text-neutral-500">
        Loading template…
      </p>
    );
  }
  if (detail === null) {
    return <p className="text-sm text-neutral-500">Template not found.</p>;
  }
  const { template, versions } = detail;
  const draft = versions.find((v) => v.status === "draft");

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
      <nav aria-label="Breadcrumb" className="text-sm text-neutral-500">
        <Link to="/admin/forms" className="underline">
          Form templates
        </Link>{" "}
        / {template.name}
      </nav>
      <div className="mt-2 flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{template.name}</h1>
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs">
          {template.type} · {template.status}
        </span>
      </div>

      <div className="mt-3 flex gap-2">
        {!draft && template.status === "active" && (
          <button
            type="button"
            onClick={() => run(() => createDraft({ templateId }))}
            className="rounded border px-3 py-1.5 text-sm"
          >
            New draft version
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            const retiring = template.status === "active";
            const reason = window.prompt(
              retiring ? "Reason for retiring?" : "Reason for restoring?",
            );
            if (reason) {
              void run(() =>
                setStatus({
                  templateId,
                  status: retiring ? "retired" : "active",
                  reason,
                }),
              );
            }
          }}
          className="rounded border px-3 py-1.5 text-sm"
        >
          {template.status === "active" ? "Retire" : "Restore"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {draft && (
        <DraftEditor draftId={draft._id} definition={draft.definition} />
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

/**
 * Draft editor: structured JSON with server-identical validation and a live
 * preview through the exact renderer patients use.
 * ponytail: JSON textarea instead of a drag-and-drop builder; upgrade when
 * non-technical admins need to edit forms unassisted.
 */
function DraftEditor({
  draftId,
  definition,
}: {
  draftId: Id<"formVersions">;
  definition: FormDefinition;
}) {
  const update = useMutation(api.domains.forms.updateDraftVersion);
  const publish = useMutation(api.domains.forms.publishVersion);
  const [text, setText] = useState(() => JSON.stringify(definition, null, 2));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewAnswers, setPreviewAnswers] = useState<Answers>({});

  function parsed(): FormDefinition | null {
    try {
      return parseDefinition(JSON.parse(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
      return null;
    }
  }

  async function onSave() {
    setError(null);
    setMessage(null);
    const def = parsed();
    if (!def) return;
    try {
      await update({ versionId: draftId, definition: def });
      setMessage("Draft saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }

  async function onPublish() {
    setError(null);
    setMessage(null);
    const def = parsed();
    if (!def) return;
    if (
      !window.confirm(
        `Publish this version? ${summarize(def)}. The published version becomes immutable and is used for new assignments.`,
      )
    ) {
      return;
    }
    try {
      await update({ versionId: draftId, definition: def });
      await publish({ versionId: draftId });
      setMessage("Published.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish");
    }
  }

  const previewDef = (() => {
    try {
      return parseDefinition(JSON.parse(text));
    } catch {
      return null;
    }
  })();

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <div>
        <h2 className="font-semibold">Draft definition</h2>
        <textarea
          aria-label="Draft form definition (JSON)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={24}
          spellCheck={false}
          className="mt-2 w-full rounded border p-2 font-mono text-xs"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void onSave()}
            className="rounded border px-3 py-1.5 text-sm"
          >
            Save draft
          </button>
          <button
            type="button"
            onClick={() => void onPublish()}
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
          >
            Publish…
          </button>
          {message && (
            <p role="status" className="text-sm text-green-700">
              {message}
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
      <div>
        <h2 className="font-semibold">Preview (patient renderer)</h2>
        {previewDef ? (
          <div className="mt-2">
            <FormRenderer
              definition={previewDef}
              answers={previewAnswers}
              onChange={(key, value) =>
                setPreviewAnswers((a) => ({ ...a, [key]: value }))
              }
            />
          </div>
        ) : (
          <p className="mt-2 text-sm text-neutral-500">
            Fix the definition to see a preview.
          </p>
        )}
      </div>
    </div>
  );
}
