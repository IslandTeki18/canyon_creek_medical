import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { NavLink, Outlet } from "react-router";
import { api } from "../../../convex/_generated/api";
import { useAuthConfigured } from "../../lib/auth";

// Neutral, practice-supplied contact and crisis content. No PHI, no advice.
const PRACTICE_CONTACT = {
  name: "Canyon Creek Integrative Health",
  phone: "(555) 010-0000",
  hours: "Monday–Friday, 8am–5pm",
};

const PORTAL_NAV = [
  { to: "/portal", label: "Home", end: true },
  { to: "/portal/profile", label: "Profile" },
  { to: "/portal/appointments", label: "Appointments" },
  { to: "/portal/forms", label: "Forms" },
  { to: "/portal/documents", label: "Documents" },
  { to: "/portal/settings", label: "Account settings" },
];

/** Portal layout: responsive nav + crisis disclaimer around child routes. */
export default function PortalPage() {
  const configured = useAuthConfigured();
  if (!configured) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">Patient portal</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Authentication is not configured in this environment.
        </p>
      </section>
    );
  }
  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <nav aria-label="Portal" className="md:w-48 md:shrink-0">
        <ul className="flex flex-wrap gap-2 md:flex-col">
          {PORTAL_NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `block rounded px-3 py-1.5 text-sm ${
                    isActive
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-700 hover:bg-neutral-100"
                  }`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1">
        <Outlet />
        <CrisisDisclaimer />
      </div>
    </div>
  );
}

function CrisisDisclaimer() {
  return (
    <aside className="mt-8 rounded border border-amber-300 bg-amber-50 p-4 text-sm">
      <h2 className="font-semibold">If you are in crisis</h2>
      <p className="mt-1">
        This portal is not monitored for emergencies. If you are experiencing a
        medical or mental health emergency, call 911. For mental health crisis
        support, call or text 988 (Suicide &amp; Crisis Lifeline), available
        24/7.
      </p>
    </aside>
  );
}

/** Portal home: activation when unlinked, otherwise the scoped dashboard. */
export function PortalHome() {
  const home = useQuery(api.domains.portal.myPortalHome, {});
  if (home === undefined) {
    return (
      <p role="status" className="text-sm text-neutral-500">
        Loading your portal…
      </p>
    );
  }
  if (home === null) return <ActivateInvitation />;
  return (
    <section>
      <h1 className="text-2xl font-semibold">Welcome, {home.displayName}</h1>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded border p-4">
          <h2 className="font-semibold">
            {home.readiness.ready ? "You're all set" : "Things to complete"}
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {home.readiness.items.map((item) => (
              <li key={`${item.kind}:${item.label}`}>
                <span aria-hidden="true">{item.satisfied ? "✓" : "○"}</span>{" "}
                {item.label}
                {!item.satisfied && (
                  <span className="text-neutral-500"> — needed</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded border p-4">
          <h2 className="font-semibold">Upcoming appointments</h2>
          <p className="mt-2 text-sm text-neutral-500">
            Appointment scheduling is coming soon. Call the practice to
            schedule.
          </p>
        </div>

        <div className="rounded border p-4">
          <h2 className="font-semibold">Intake forms</h2>
          <p className="mt-2 text-sm text-neutral-500">
            Your forms will appear here when they are assigned.
          </p>
        </div>

        <div className="rounded border p-4">
          <h2 className="font-semibold">Contact the practice</h2>
          <p className="mt-2 text-sm">
            {PRACTICE_CONTACT.name}
            <br />
            {PRACTICE_CONTACT.phone}
            <br />
            {PRACTICE_CONTACT.hours}
          </p>
        </div>
      </div>
    </section>
  );
}

const ACTIVATION_ERRORS: Record<
  "invalid" | "expired" | "revoked" | "consumed" | "mismatch",
  string
> = {
  invalid: "That activation code is not recognized. Check it and try again.",
  expired: "This invitation has expired. Contact the practice for a new one.",
  revoked: "This invitation is no longer valid. Contact the practice.",
  consumed: "This invitation was already used. Contact the practice.",
  mismatch:
    "This invitation is for a different account. Sign in with the email address the practice has on file.",
};

function ActivateInvitation() {
  const accept = useMutation(api.domains.patientInvitations.acceptInvitation);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await accept({ token: token.trim() });
      if (result.status !== "accepted") {
        setError(ACTIVATION_ERRORS[result.status]);
      }
      // On success myPortalHome re-renders reactively into the dashboard.
    } catch {
      setError("Something went wrong. Try again or contact the practice.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold">Activate your account</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Enter the activation code from your invitation to connect this account
        to your patient record.
      </p>
      <form onSubmit={onSubmit} className="mt-4 max-w-md">
        <label className="block text-sm font-medium" htmlFor="activation-code">
          Activation code
        </label>
        <input
          id="activation-code"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
          autoComplete="off"
          className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
        />
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !token.trim()}
          className="mt-3 rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {busy ? "Activating…" : "Activate"}
        </button>
      </form>
    </section>
  );
}

/** Placeholder for portal sections that land in later increments. */
export function PortalPlaceholder({ title }: { title: string }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-neutral-500">
        This section is coming soon.
      </p>
    </section>
  );
}
