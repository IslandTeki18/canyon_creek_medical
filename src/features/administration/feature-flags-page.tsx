import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";

export default function FeatureFlagsPage() {
  const flags = useQuery(api.domains.featureFlags.listFlags, {});
  const setFlag = useMutation(api.domains.featureFlags.setFlag);
  const [error, setError] = useState<string | null>(null);

  if (flags === undefined) return <p role="status">Loading feature flags…</p>;

  function toggle(key: string, label: string, enabled: boolean) {
    const reason = window.prompt(
      `Why are you turning ${label} ${enabled ? "on" : "off"}? (kept in the activity log)`,
    );
    if (!reason) return;
    setError(null);
    setFlag({ key, enabled, reason }).catch((thrown: Error) => {
      if (!thrown.message.includes("approval record")) {
        setError(thrown.message);
        return;
      }
      const reference = window.prompt(
        "This module is regulated. Approval reference (certification, agreement, or checklist id):",
      );
      const approvedBy = reference ? window.prompt("Who approved it?") : null;
      if (!reference || !approvedBy) {
        setError(thrown.message);
        return;
      }
      setFlag({
        key,
        enabled,
        reason,
        approval: { reference, approvedBy, approvedAt: Date.now() },
      }).catch((retry: Error) => setError(retry.message));
    });
  }

  const practiceFlags = flags.filter((flag) => !flag.regulated);
  const regulatedFlags = flags.filter((flag) => flag.regulated);

  return (
    <section>
      <h1 className="font-display text-3xl">Features</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Turn parts of the site on or off. Changes apply immediately for
        everyone.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <h2 className="mt-6 font-display text-xl">Practice features</h2>
      <div className="mt-2 divide-y rounded border">
        {practiceFlags.map((flag) => (
          <div
            key={flag.key}
            className="flex items-center justify-between gap-4 p-4"
          >
            <div>
              <h3 className="font-medium">{flag.label}</h3>
              {flag.description && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {flag.description}
                </p>
              )}
              <p className="mt-1 text-xs font-medium uppercase">
                {flag.enabled ? "On" : "Off"}
              </p>
            </div>
            <button
              type="button"
              className="rounded border px-3 py-2 text-sm"
              onClick={() => toggle(flag.key, flag.label, !flag.enabled)}
            >
              Turn {flag.enabled ? "off" : "on"}
            </button>
          </div>
        ))}
      </div>

      <details className="mt-6">
        <summary className="cursor-pointer font-display text-xl">
          Advanced (regulated modules)
        </summary>
        <p className="mt-2 text-sm text-muted-foreground">
          Environment: {flags[0]?.environment ?? "unknown"}.
        </p>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Module</th>
              <th>State</th>
              <th>Default</th>
              <th>Approval</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {regulatedFlags.map((flag) => (
              <tr key={flag.key} className="border-b">
                <td className="py-2">{flag.label}</td>
                <td>
                  {flag.enabled ? "on" : "off"}
                  {flag.overridden ? " (override)" : ""}
                </td>
                <td>{flag.environmentDefault ? "on" : "off"}</td>
                <td>{flag.approval?.reference ?? "—"}</td>
                <td className="py-2">
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs"
                    onClick={() => toggle(flag.key, flag.label, !flag.enabled)}
                  >
                    Turn {flag.enabled ? "off" : "on"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
