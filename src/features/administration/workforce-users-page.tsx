import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";
import { ROLES, type Role } from "../../../convex/lib/permissions";
import { useAuthConfigured } from "../../lib/auth";

const WORKFORCE_ROLES = ROLES.filter((r) => r !== "patient");

export default function WorkforceUsersPage() {
  const configured = useAuthConfigured();
  return (
    <section>
      <h1 className="font-display text-3xl">Workforce users</h1>
      {configured ? (
        <>
          <InviteForm />
          <UserList />
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Authentication is not configured in this environment.
        </p>
      )}
    </section>
  );
}

function InviteForm() {
  const invite = useMutation(api.domains.workforce.inviteWorkforceUser);
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await invite({ email, roles });
      setEmail("");
      setRoles([]);
      setMessage("Invitation created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invitation failed");
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 max-w-md space-y-3 p-6 rounded-organic bg-card shadow-organic-sm"
    >
      <h2 className="font-medium">Invite a staff member</h2>
      <label className="block text-sm">
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-full border bg-card px-3 py-1"
        />
      </label>
      <fieldset className="text-sm">
        <legend>Roles</legend>
        {WORKFORCE_ROLES.map((role) => (
          <label key={role} className="mr-3 inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={roles.includes(role)}
              onChange={(e) =>
                setRoles((prev) =>
                  e.target.checked
                    ? [...prev, role]
                    : prev.filter((r) => r !== role),
                )
              }
            />
            {role}
          </label>
        ))}
      </fieldset>
      <button
        type="submit"
        disabled={roles.length === 0}
        className="rounded-full bg-primary hover:bg-clay-600 px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
      >
        Send invitation
      </button>
      {message && (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
    </form>
  );
}

function UserList() {
  const users = useQuery(api.domains.workforce.listWorkforceUsers);
  if (users === undefined) {
    return (
      <p role="status" className="mt-4 text-sm text-muted-foreground">
        Loading users…
      </p>
    );
  }
  if (users.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        No workforce users yet.
      </p>
    );
  }
  return (
    <table className="mt-4 w-full text-left text-sm">
      <thead>
        <tr className="border-b">
          <th className="py-2">Name</th>
          <th>Email</th>
          <th>Roles</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u._id} className="border-b">
            <td className="py-2">
              <Link to={`/admin/users/${u._id}`} className="underline">
                {u.displayName}
              </Link>
            </td>
            <td>{u.email}</td>
            <td>{u.roles.join(", ") || "—"}</td>
            <td>{u.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
