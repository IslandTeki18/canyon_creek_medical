import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";

/**
 * Feature-flag administration (12.2). The toggle here only asks the server
 * to change a stored row — the flag value itself is never client-owned, and
 * a flag never replaces the capability check on the operation it gates.
 */
export default function FeatureFlagsPage() {
  const flags = useQuery(api.domains.featureFlags.listFlags, {});
  const setFlag = useMutation(api.domains.featureFlags.setFlag);
  const [error, setError] = useState<string | null>(null);

  if (flags === undefined) return <p role="status">Loading feature flags…</p>;

  function toggle(key: string, label: string, enabled: boolean) {
    const reason = window.prompt(
      `Reason for turning ${label} ${enabled ? "on" : "off"}?`,
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

  return (
    <section>
      <h1 className="font-display text-3xl">Feature flags</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Modules awaiting clinical, legal, or operational approval stay off.
        Environment: {flags[0]?.environment ?? "unknown"}.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <table className="mt-4 w-full text-left text-sm">
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
          {flags.map((flag) => (
            <tr key={flag.key} className="border-b">
              <td className="py-2">
                {flag.label}
                {flag.regulated && (
                  <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                    regulated
                  </span>
                )}
              </td>
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
    </section>
  );
}
