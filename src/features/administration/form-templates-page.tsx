import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../../../convex/_generated/api";
import { NameDialog } from "../../components/ui/name-dialog";
import { useAuthConfigured } from "../../lib/auth";

type TemplateType = "intake" | "consent" | "assessment";

function formTypeLabel(type: TemplateType) {
  return {
    intake: "Intake form",
    consent: "Consent",
    assessment: "Assessment",
  }[type];
}

export default function FormTemplatesPage() {
  const configured = useAuthConfigured();
  return (
    <section>
      <h1 className="font-display text-3xl">Form templates</h1>
      {configured ? (
        <Templates />
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Authentication is not configured in this environment.
        </p>
      )}
    </section>
  );
}

function Templates() {
  const templates = useQuery(api.domains.forms.listTemplates, {});
  const create = useMutation(api.domains.forms.createTemplate);
  const createDraft = useMutation(api.domains.forms.createDraftVersion);
  const navigate = useNavigate();
  const [type, setType] = useState<TemplateType>("intake");

  if (templates === undefined) {
    return (
      <p role="status" className="mt-4 text-sm text-muted-foreground">
        Loading templates…
      </p>
    );
  }
  return (
    <div className="mt-4 space-y-6">
      <NameDialog
        title="New form template"
        description="Choose a name and type."
        nameLabel="Name"
        trigger={
          <button
            type="button"
            className="rounded-full bg-primary px-3 py-1.5 text-sm text-primary-foreground"
          >
            New template
          </button>
        }
        onCreate={async (name) => {
          const templateId = await create({ name, type });
          await createDraft({ templateId });
          return templateId;
        }}
        onCreated={(templateId) => void navigate(`/admin/forms/${templateId}`)}
      >
        <label className="mt-4 block text-sm">
          Type
          <select
            value={type}
            onChange={(event) => setType(event.target.value as TemplateType)}
            className="mt-1 block w-full rounded border bg-card px-3 py-2"
          >
            <option value="intake">Intake form</option>
            <option value="consent">Consent</option>
            <option value="assessment">Assessment</option>
          </select>
        </label>
      </NameDialog>

      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No templates yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Name</th>
              <th>Type</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t._id} className="border-b">
                <td className="py-2">
                  <Link to={`/admin/forms/${t._id}`} className="underline">
                    {t.name}
                  </Link>
                </td>
                <td>{formTypeLabel(t.type)}</td>
                <td>{t.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <RulesSection templates={templates} />
    </div>
  );
}

function RulesSection({
  templates,
}: {
  templates: { _id: string; name: string; status: string }[];
}) {
  const rules = useQuery(api.domains.assignments.listRules, {});
  const createRule = useMutation(api.domains.assignments.createRule);
  const setActive = useMutation(api.domains.assignments.setRuleActive);
  const [templateId, setTemplateId] = useState("");
  const [audience, setAudience] = useState<"all" | "new" | "returning">("all");
  const [error, setError] = useState<string | null>(null);

  const active = templates.filter((t) => t.status === "active");
  return (
    <div>
      <h2 className="font-semibold">Assignment rules</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          createRule({
            templateId: templateId as Parameters<
              typeof createRule
            >[0]["templateId"],
            audience,
          }).catch((err) =>
            setError(err instanceof Error ? err.message : "Could not create"),
          );
        }}
        className="mt-2 flex flex-wrap items-end gap-3"
      >
        <label className="text-sm">
          Template
          <select
            required
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="mt-1 block w-64 rounded-full border bg-card px-3 py-1"
          >
            <option value="">Select…</option>
            {active.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Audience
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as typeof audience)}
            className="mt-1 block rounded-full border bg-card px-3 py-1"
          >
            <option value="all">All patients</option>
            <option value="new">New patients</option>
            <option value="returning">Returning patients</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-full border px-3 py-1.5 text-sm"
        >
          Add rule
        </button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
      {rules === undefined ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          Loading rules…
        </p>
      ) : rules.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No rules yet.</p>
      ) : (
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Template</th>
              <th>Audience</th>
              <th>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r._id} className="border-b">
                <td className="py-2">{r.templateName}</td>
                <td>{r.audience}</td>
                <td>{r.active ? "yes" : "no"}</td>
                <td>
                  <button
                    type="button"
                    onClick={() =>
                      void setActive({ ruleId: r._id, active: !r.active })
                    }
                    className="rounded-full border bg-card px-3 py-1 text-xs"
                  >
                    {r.active ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
