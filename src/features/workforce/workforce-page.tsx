import { useQuery } from "convex/react";
import { Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../../../convex/_generated/api";
import { FeatureGate } from "../../lib/features";
import { PermissionGate } from "../../lib/permission-gate";

const CARD = "rounded-card bg-surface shadow-card";
const CARD_TITLE = "m-0 text-lg font-bold tracking-[-0.015em]";
const PILL = "rounded-full px-3 py-1.25 text-[11.5px] font-bold";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Staff workspace: today's counts, schedule, open tasks, and patient lookup. */
export default function WorkforcePage() {
  return (
    <section>
      <div className="mb-6.5 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="m-0 mb-1.5 font-display text-3xl">Today</h1>
          <p className="m-0 text-sm text-ink/60">
            {new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(
              new Date(),
            )}
          </p>
        </div>
        <PermissionGate capability="patient.manage">
          <Link
            to="/app/patients/new"
            className="rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white no-underline shadow-action hover:bg-primary-deep hover:text-white"
          >
            New patient
          </Link>
        </PermissionGate>
      </div>

      <PermissionGate capability="report.view">
        <Metrics />
      </PermissionGate>

      <div className="flex flex-wrap items-start gap-5">
        <PermissionGate capability="appointment.manage">
          <ScheduleCard />
        </PermissionGate>
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-5">
          <FeatureGate flag="clinical">
            <NeedsYou />
          </FeatureGate>
          <FindPatient />
        </div>
      </div>
    </section>
  );
}

const METRIC_TONE: Record<string, string> = {
  unconfirmed: "text-primary",
  notReady: "text-alert",
};
const METRIC_KEYS = [
  "appointments",
  "unconfirmed",
  "notReady",
  "incompleteIntake",
  "unresolvedTasks",
];

function Metrics() {
  const dashboard = useQuery(api.domains.reporting.operationalDashboard, {});
  if (!dashboard) return null;
  return (
    <ul className="m-0 mb-7 grid list-none grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3.5 p-0">
      {dashboard.metrics
        .filter((item) => METRIC_KEYS.includes(item.key))
        .map((item) => (
          <li
            key={item.key}
            className="rounded-[20px] bg-surface p-5 shadow-card"
          >
            <Link
              to={item.link ?? "/app/schedule"}
              className="block text-inherit no-underline"
            >
              <span
                className={`block text-[34px] leading-none font-extrabold tracking-[-0.03em] ${METRIC_TONE[item.key] ?? ""}`}
              >
                {item.count}
              </span>
              <span className="mt-1.5 block text-[13px] font-semibold text-ink/65">
                {item.label}
              </span>
            </Link>
          </li>
        ))}
    </ul>
  );
}

function statusPill(row: { ready: boolean; status: string }) {
  if (!row.ready) return ["Not ready", "bg-warn-tint text-warn-ink"];
  if (row.status === "scheduled")
    return ["Unconfirmed", "bg-primary-tint text-primary-deep"];
  return ["Ready", "bg-teal-tint text-teal"];
}

function ScheduleCard() {
  const today = todayIso();
  const rows = useQuery(api.domains.appointments.listSchedule, {
    fromDate: today,
    toDate: today,
  });
  return (
    <div className={`${CARD} min-w-0 flex-[1_1_460px] overflow-hidden`}>
      <div className="flex items-center justify-between gap-4 px-6.5 pt-5.5 pb-4">
        <h2 className={CARD_TITLE}>Schedule</h2>
        <Link
          to="/app/schedule"
          className="text-[13px] font-semibold text-primary no-underline"
        >
          Open full calendar →
        </Link>
      </div>
      {rows === undefined ? (
        <Empty>Loading schedule…</Empty>
      ) : rows.length === 0 ? (
        <Empty>No appointments today.</Empty>
      ) : (
        rows.map((row) => {
          const [label, tone] = statusPill(row);
          return (
            <Link
              key={row._id}
              to={`/app/appointments/${row._id}`}
              className="grid grid-cols-[76px_minmax(0,1fr)_auto] items-center gap-4 border-t border-ink/8 px-6.5 py-3.5 text-inherit no-underline hover:bg-surface-inset"
            >
              <span className="text-[13.5px] font-bold tabular-nums">
                {row.localTime}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14.5px] font-semibold">
                  {row.patientName} — {row.appointmentTypeName}
                </span>
                <span className="block text-[12.5px] text-ink/55">
                  {row.providerName} · {row.locationName}
                </span>
              </span>
              <span className={`${PILL} ${tone}`}>{label}</span>
            </Link>
          );
        })
      )}
    </div>
  );
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-alert",
  high: "bg-alert",
  normal: "bg-primary",
  low: "bg-ink/25",
};

function NeedsYou() {
  const tasks = useQuery(api.domains.tasks.listMyTasks, {});
  return (
    <div className={`${CARD} px-6 py-5.5`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className={CARD_TITLE}>Needs you</h2>
        {tasks && tasks.length > 0 && (
          <span className={`${PILL} bg-primary-tint text-primary-deep`}>
            {tasks.length}
          </span>
        )}
      </div>
      {tasks === undefined ? (
        <p className="m-0 text-sm text-ink/55">Loading tasks…</p>
      ) : tasks.length === 0 ? (
        <p className="m-0 text-sm text-ink/55">Nothing assigned to you.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {tasks.slice(0, 5).map((task) => (
            <li key={task._id} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={`mt-1.5 size-2 flex-none rounded-full ${PRIORITY_DOT[task.priority] ?? "bg-primary"}`}
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  {task.title}
                </span>
                <span className="block text-[12.5px] text-ink/55">
                  {task.dueAt
                    ? `Due ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(task.dueAt)}`
                    : "No due date"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/app/tasks"
        className="mt-4 block text-[13px] font-semibold text-primary no-underline"
      >
        All tasks →
      </Link>
    </div>
  );
}

function FindPatient() {
  const [term, setTerm] = useState("");
  const navigate = useNavigate();
  return (
    <form
      className={`${CARD} px-6 py-5.5`}
      onSubmit={(event) => {
        event.preventDefault();
        void navigate(`/app/patients?term=${encodeURIComponent(term.trim())}`);
      }}
    >
      <h2 className={`${CARD_TITLE} mb-3.5`}>Find a patient</h2>
      <div className="flex min-h-11.5 items-center gap-2.5 rounded-full border-[1.5px] border-ink/14 bg-field px-4 focus-within:border-primary">
        <Search size={17} strokeWidth={2} className="flex-none text-ink/40" />
        <input
          type="search"
          aria-label="Search patients"
          placeholder="Name, date of birth or MRN"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          className="min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none"
        />
      </div>
      <p className="mt-3.5 mb-0 text-[12.5px] leading-[1.6] text-ink/55">
        Chart access is logged. Search results respect your role.
      </p>
    </form>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="m-0 border-t border-ink/8 px-6.5 py-5 text-sm text-ink/55"
    >
      {children}
    </p>
  );
}
