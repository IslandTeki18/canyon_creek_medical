import { useQuery } from "convex/react";
import {
  CalendarCog,
  ChartNoAxesColumn,
  FileText,
  LayoutDashboard,
  MessageSquareText,
  PackageSearch,
  PanelsTopLeft,
  ScrollText,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";
import { FEATURE_FLAGS } from "../../../convex/lib/featureFlags";
import {
  IconTile,
  type IconType,
} from "../../features/public/marketing-chrome";
import { FeatureGate } from "../../lib/features";

const CARD = "rounded-card bg-surface shadow-card";
const CARD_TITLE = "m-0 text-lg font-bold tracking-[-0.015em]";
const CARD_LINK = "text-[13px] font-semibold text-primary no-underline";

/** Administration overview: grouped lists replace the grid of hub cards. */
export default function AdminPage() {
  return (
    <section>
      <div className="mb-7">
        <h1 className="m-0 mb-1.5 font-display text-3xl">Administration</h1>
        <p className="m-0 text-sm text-ink/60">
          Practice configuration and user management.
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-5">
          <GroupedList label="People & access">
            <Row
              to="/admin/users"
              icon={Users}
              title="Workforce users"
              description="Invite staff, manage roles and account status."
            />
            <FeatureGate flag="reporting">
              <Row
                to="/admin/audit"
                icon={ScrollText}
                title="Audit review"
                description="Exports, role changes, overrides, and sensitive activity."
              />
            </FeatureGate>
          </GroupedList>

          <GroupedList label="Scheduling">
            <Row
              to="/admin/scheduling"
              icon={CalendarCog}
              title="Scheduling configuration"
              description="Appointment types, provider availability and rules."
            />
            <Row
              to="/admin/services"
              icon={PackageSearch}
              title="Bookable services"
              description="Services, effective dates, and their linked configuration."
            />
          </GroupedList>

          <GroupedList label="Content & forms">
            <Row
              to="/admin/service-pages"
              icon={PanelsTopLeft}
              title="Website services"
              description="Author and publish public website service content."
            />
            <FeatureGate flag="intakeForms">
              <Row
                to="/admin/forms"
                icon={FileText}
                title="Form templates"
                description="Author and publish intake and consent forms."
              />
            </FeatureGate>
            <FeatureGate flag="communications">
              <Row
                to="/admin/communications"
                icon={MessageSquareText}
                title="Communications"
                description="Manage neutral templates and reminder schedules."
              />
            </FeatureGate>
          </GroupedList>

          <FeatureGate flag="reporting">
            <GroupedList label="Insight">
              <Row
                to="/admin/dashboard"
                icon={LayoutDashboard}
                title="Operations dashboard"
                description="Daily appointment, intake, message, and task counts."
              />
              <Row
                to="/admin/reports"
                icon={ChartNoAxesColumn}
                title="Reports"
                description="Utilization and completion measures with audited export."
              />
            </GroupedList>
          </FeatureGate>
        </div>

        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-5">
          <FeatureGate flag="reporting">
            <Glance />
          </FeatureGate>
          <Features />
        </div>
      </div>
    </section>
  );
}

function GroupedList({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={`${CARD} overflow-hidden`}>
      <h2 className="m-0 px-6 pt-5 pb-3.5 text-[11px] font-bold tracking-[0.09em] text-primary uppercase">
        {label}
      </h2>
      {children}
    </div>
  );
}

function Row({
  to,
  icon,
  title,
  description,
}: {
  to: string;
  icon: IconType;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="grid min-h-11 grid-cols-[38px_minmax(0,1fr)_16px] items-center gap-3.5 border-t border-ink/7 px-6 py-4 text-inherit no-underline hover:bg-surface-inset"
    >
      <IconTile as={icon} size={38} />
      <span className="min-w-0">
        <span className="block text-[15px] font-bold">{title}</span>
        <span className="block text-[13px] text-ink/60">{description}</span>
      </span>
      <span aria-hidden="true" className="text-[15px] text-ink/30">
        →
      </span>
    </Link>
  );
}

const GLANCE_KEYS = [
  "appointments",
  "completed",
  "noShows",
  "failedCommunications",
];

function Glance() {
  const dashboard = useQuery(api.domains.reporting.operationalDashboard, {});
  return (
    <div className={`${CARD} p-6`}>
      <div className="mb-4.5 flex items-center justify-between gap-3">
        <h2 className={CARD_TITLE}>Today at a glance</h2>
        <Link to="/admin/reports" className={CARD_LINK}>
          Reports →
        </Link>
      </div>
      {dashboard === undefined ? (
        <p role="status" className="m-0 text-sm text-ink/55">
          Loading counts…
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0">
          {dashboard.metrics
            .filter((item) => GLANCE_KEYS.includes(item.key))
            .map((item) => (
              <li key={item.key} className="rounded-2xl bg-surface-inset p-4">
                <span
                  className={`block text-[26px] leading-none font-extrabold tracking-[-0.03em] ${
                    item.key === "failedCommunications" && item.count > 0
                      ? "text-alert"
                      : ""
                  }`}
                >
                  {item.count}
                </span>
                <span className="mt-1.25 block text-[12.5px] font-semibold text-ink/60">
                  {item.label}
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

const FEATURED_FLAGS = [
  "patientPortal",
  "intakeForms",
  "communications",
  "reporting",
];

function Features() {
  const flags = useQuery(api.domains.featureFlags.publicFlags);
  return (
    <div className={`${CARD} p-6`}>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <h2 className={CARD_TITLE}>Features</h2>
        <Link to="/admin/feature-flags" className={CARD_LINK}>
          All →
        </Link>
      </div>
      <p className="mt-0 mb-4.5 text-[13px] leading-[1.6] text-ink/60">
        Turn parts of the site on or off.
      </p>
      <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
        {FEATURED_FLAGS.map((key) => {
          const enabled = flags?.[key] === true;
          return (
            <li key={key} className="flex items-center justify-between gap-3.5">
              <span
                className={`text-sm font-semibold ${enabled ? "" : "text-ink/55"}`}
              >
                {FEATURE_FLAGS[key]?.label ?? key}
              </span>
              <span
                role="img"
                aria-label={enabled ? "On" : "Off"}
                className={`flex h-6 w-10.5 flex-none rounded-full p-0.75 ${
                  enabled ? "justify-end bg-primary" : "justify-start bg-ink/16"
                }`}
              >
                <span className="block size-4.5 rounded-full bg-surface" />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
