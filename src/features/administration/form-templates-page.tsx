import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";
import { useAuthConfigured } from "../../lib/auth";

export default function FormTemplatesPage() {
  const configured = useAuthConfigured();
  return (
    <section>
      <h1 className="text-2xl font-semibold">Form templates</h1>
      {configured ? (
        <Templates />
      ) : (
        <p className="mt-2 text-sm text-neutral-500">
          Authentication is not configured in this environment.
        </p>
      )}
    </section>
  );
}

function Templates() {
  const templates = useQuery(api.domains.forms.listTemplates, {});
  const create = useMutation(api.domains.forms.createTemplate);
  const [name, setName] = useState("");
  const [type, setType] = useState<"intake" | "consent">("intake");
  const [error, setError] = useState<string | null>(null);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await create({ name, type });
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create");
    }
  }

  if (templates === undefined) {
    return (
      <p role="status" className="mt-4 text-sm text-neutral-500">
        Loading templates…
      </p>
    );
  }
  return (
    <div className="mt-4 space-y-6">
      <form onSubmit={onCreate} className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-64 rounded border px-2 py-1"
          />
        </label>
        <label className="text-sm">
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="mt-1 block rounded border px-2 py-1"
          >
            <option value="intake">Intake</option>
            <option value="consent">Consent</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
        >
          New template
        </button>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </form>

      {templates.length === 0 ? (
        <p className="text-sm text-neutral-500">No templates yet.</p>
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
                <td>{t.type}</td>
                <td>{t.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
