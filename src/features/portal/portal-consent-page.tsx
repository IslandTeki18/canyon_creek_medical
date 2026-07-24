import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export default function PortalConsentPage() {
  const { templateId } = useParams();
  if (!templateId) return null;
  return <ConsentSign templateId={templateId as Id<"formTemplates">} />;
}

function ConsentSign({ templateId }: { templateId: Id<"formTemplates"> }) {
  const content = useQuery(api.domains.consents.getMyConsentContent, {
    templateId,
  });
  const sign = useMutation(api.domains.consents.signMyConsent);
  const navigate = useNavigate();
  const [signatureName, setSignatureName] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (content === undefined) {
    return (
      <p role="status" className="text-sm text-neutral-500">
        Loading consent…
      </p>
    );
  }
  if (content.alreadySigned) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">{content.templateName}</h1>
        <p className="mt-2 text-sm text-green-700">
          You have already signed this consent.
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await sign({
        templateId,
        versionId: content!.versionId,
        signatureName,
        acknowledged,
      });
      navigate("/portal/forms");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold">{content.templateName}</h1>
      <p className="mt-1 text-xs text-neutral-500">
        Version {content.versionNumber}
      </p>
      <div className="mt-4 max-w-lg space-y-4">
        {content.definition.sections.map((section) => (
          <div key={section.title} className="rounded border p-4">
            <h2 className="font-medium">{section.title}</h2>
            {section.content && (
              <p className="mt-2 text-sm whitespace-pre-wrap">
                {section.content}
              </p>
            )}
          </div>
        ))}
        <form onSubmit={onSubmit} className="space-y-3 rounded border p-4">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5"
            />
            I have read and understood the content above, and I agree.
          </label>
          <label className="block text-sm">
            Type your full legal name to sign
            <input
              value={signatureName}
              onChange={(e) => setSignatureName(e.target.value)}
              required
              autoComplete="off"
              className="mt-1 w-full rounded border px-2 py-1"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !acknowledged || !signatureName.trim()}
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {busy ? "Signing…" : "Sign consent"}
          </button>
        </form>
      </div>
    </section>
  );
}
