import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ROLES, type Role } from "../../../convex/lib/permissions";
import { useAuthConfigured } from "../../lib/auth";

const WORKFORCE_ROLES = ROLES.filter((r) => r !== "patient");

export default function WorkforceUserDetailPage() {
  const configured = useAuthConfigured();
  const { userId } = useParams();
  if (!configured || !userId) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">Workforce user</h1>
        <p className="mt-2 text-sm text-neutral-500">Not available.</p>
      </section>
    );
  }
  return <Detail userId={userId as Id<"users">} />;
}

function Detail({ userId }: { userId: Id<"users"> }) {
  const detail = useQuery(api.domains.workforce.getWorkforceUser, { userId });
  const setStatus = useMutation(api.domains.workforce.setWorkforceUserStatus);
  const setRoles = useMutation(api.domains.workforce.setWorkforceUserRoles);
  const [reason, setReason] = useState("");
  const [roles, setRolesState] = useState<Role[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (detail === undefined) {
    return (
      <p role="status" className="text-sm text-neutral-500">
        Loading…
      </p>
    );
  }
  if (detail === null) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">Workforce user</h1>
        <p className="mt-2 text-sm text-neutral-500">User not found.</p>
        <Link to="/admin/users" className="text-sm underline">
          Back to users
        </Link>
      </section>
    );
  }

  const { user, auditEvents } = detail;
  const editedRoles = roles ?? (user.roles as Role[]);

  async function act(fn: () => Promise<unknown>) {
    setMessage(null);
    try {
      await fn();
      setMessage("Saved.");
      setReason("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold">{user.displayName}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {user.email} · status: {user.status}
      </p>

      <div className="mt-4 max-w-md space-y-3 border p-4 text-sm">
        <fieldset>
          <legend className="font-medium">Roles</legend>
          {WORKFORCE_ROLES.map((role) => (
            <label key={role} className="mr-3 inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={editedRoles.includes(role)}
                onChange={(e) =>
                  setRolesState(
                    e.target.checked
                      ? [...editedRoles, role]
                      : editedRoles.filter((r) => r !== role),
                  )
                }
              />
              {role}
            </label>
          ))}
        </fieldset>
        <label className="block">
          Reason (required for changes)
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!reason.trim()}
            onClick={() =>
              act(() => setRoles({ userId, roles: editedRoles, reason }))
            }
            className="rounded bg-neutral-900 px-3 py-1.5 text-white disabled:opacity-50"
          >
            Save roles
          </button>
          {(["active", "suspended", "deactivated"] as const)
            .filter((s) => s !== user.status)
            .map((status) => (
              <button
                key={status}
                type="button"
                disabled={!reason.trim()}
                onClick={() => act(() => setStatus({ userId, status, reason }))}
                className="rounded border px-3 py-1.5 disabled:opacity-50"
              >
                Mark {status}
              </button>
            ))}
        </div>
        {message && (
          <p role="status" className="text-neutral-600">
            {message}
          </p>
        )}
      </div>

      <h2 className="mt-6 font-medium">Audit trail</h2>
      {auditEvents.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">No audit events.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {auditEvents.map((e) => (
            <li key={e._id}>
              {new Date(e.createdAt).toLocaleString()} — {e.action}
              {e.reason ? ` (${e.reason})` : ""}
            </li>
          ))}
        </ul>
      )}
      <Link to="/admin/users" className="mt-4 inline-block text-sm underline">
        Back to users
      </Link>
    </section>
  );
}
