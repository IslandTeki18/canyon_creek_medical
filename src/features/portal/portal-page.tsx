import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { NavLink, Outlet } from "react-router";
import { api } from "../../../convex/_generated/api";
import { useAuthConfigured } from "../../lib/auth";
import { KICKER, WRAP } from "../public/marketing-chrome";

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
  { to: "/portal/health-record", label: "Health record" },
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
    <div className={`${WRAP} pt-10 pb-20`}>
      <span className={`${KICKER} mb-6`}>Patient portal</span>
      <div className="grid items-start gap-[clamp(24px,4vw,44px)] md:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Portal" className="md:sticky md:top-6">
          <ul className="m-0 flex list-none gap-1 overflow-x-auto p-0 md:flex-col">
            {PORTAL_NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `block rounded-full px-4 py-2.5 font-display text-[15px] whitespace-nowrap no-underline ${
                      isActive
                        ? "bg-primary text-white"
                        : "text-ink hover:bg-ink/7"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">
          <Outlet />
          <CrisisDisclaimer />
        </div>
      </div>
    </div>
  );
}

function CrisisDisclaimer() {
  return (
    <aside className="mt-8 rounded border border-amber-300 bg-amber-50 p-4 text-sm">
      <h2 className="m-0 font-display text-lg">If you are in crisis</h2>
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
      <h1 className="m-0 font-display text-[clamp(28px,3.4vw,42px)]">
        Welcome back, {home.displayName}
      </h1>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-[28px] bg-surface p-6">
          <h2 className="m-0 font-display text-lg">
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

        <div className="rounded-[28px] bg-surface p-6">
          <h2 className="m-0 font-display text-lg">Upcoming appointments</h2>
          <p className="mt-2 text-sm text-neutral-500">
            Appointment scheduling is coming soon. Call the practice to
            schedule.
          </p>
        </div>

        <div className="rounded-[28px] bg-surface p-6">
          <h2 className="m-0 font-display text-lg">Intake forms</h2>
          <p className="mt-2 text-sm text-neutral-500">
            Your forms will appear here when they are assigned.
          </p>
        </div>

        <div className="rounded-[28px] bg-surface p-6">
          <h2 className="m-0 font-display text-lg">Recent activity</h2>
          <RecentActivity />
        </div>

        <div className="rounded-[28px] bg-surface p-6">
          <h2 className="m-0 font-display text-lg">Contact the practice</h2>
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

/** Patient-appropriate slice of the unified timeline (11.5). */
function RecentActivity() {
  const page = useQuery(api.domains.timeline.myTimeline, { limit: 5 });
  if (page === undefined) {
    return (
      <p role="status" className="mt-2 text-sm text-neutral-500">
        Loading your activity…
      </p>
    );
  }
  if (page.entries.length === 0) {
    return <p className="mt-2 text-sm text-neutral-500">Nothing yet.</p>;
  }
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {page.entries.map((entry) => (
        <li key={`${entry.type}:${entry.id}`}>
          <span className="text-neutral-500">
            {new Date(entry.at).toLocaleDateString()}
          </span>{" "}
          {entry.summary}
        </li>
      ))}
    </ul>
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
      <h1 className="m-0 font-display text-3xl">Activate your account</h1>
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
      <h1 className="m-0 font-display text-3xl">{title}</h1>
      <p className="mt-2 text-sm text-neutral-500">
        This section is coming soon.
      </p>
    </section>
  );
}
