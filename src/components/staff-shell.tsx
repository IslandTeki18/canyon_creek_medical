import {
  CalendarCog,
  CalendarDays,
  ChartNoAxesColumn,
  ContactRound,
  Globe,
  Hourglass,
  LayoutDashboard,
  MessageSquareWarning,
  Newspaper,
  PanelsTopLeft,
  Settings,
  Stethoscope,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import type { IconType } from "../features/public/marketing-chrome";
import { AuthControls } from "../lib/auth";
import { FeatureGate } from "../lib/features";
import { PermissionGate } from "../lib/permission-gate";

/**
 * Staff and administration chrome: a persistent navy sidebar plus the work
 * surface (DESIGN.md §6 "App sidebar"). Links are presentation only — routes
 * and Convex functions enforce access.
 */
export function StaffShell() {
  const admin = useLocation().pathname.startsWith("/admin");
  return (
    <div className="flex min-h-screen bg-ground font-body text-ink">
      <nav
        aria-label="Workspace"
        className="sticky top-0 flex h-screen w-[264px] flex-none flex-col gap-6.5 bg-ink px-4 py-6 text-white"
      >
        <NavLink
          to="/"
          className="px-2.5 text-[17px] font-extrabold tracking-[-0.02em] text-white no-underline"
        >
          Canyon Creek
        </NavLink>
        {admin ? <AdminItems /> : <WorkItems />}
        <div className="mt-auto flex flex-col gap-0.75">
          {admin ? (
            <Item to="/app" icon={LayoutDashboard} muted>
              Back to workspace
            </Item>
          ) : (
            <PermissionGate capability="config.manage">
              <Item to="/admin" icon={Settings} muted>
                Administration
              </Item>
            </PermissionGate>
          )}
          <Item to="/" icon={Globe} muted>
            Back to website
          </Item>
          <div className="mt-3 flex items-center gap-3 border-t border-white/12 px-3 pt-4 empty:hidden">
            <AuthControls />
          </div>
        </div>
      </nav>
      <main
        id="main-content"
        className="min-w-0 flex-1 px-[clamp(20px,3vw,40px)] py-8"
      >
        <Outlet />
      </main>
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.75">
      <span className="px-2.5 pb-2 text-[10.5px] font-bold tracking-[0.09em] text-white/42 uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

function Item({
  to,
  icon: As,
  end,
  muted,
  children,
}: {
  to: string;
  icon: IconType;
  end?: boolean;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex min-h-11 items-center gap-2.75 rounded-xl px-3 py-2.75 text-sm no-underline ${
          isActive
            ? "bg-primary font-semibold text-white"
            : `font-medium hover:bg-white/8 hover:text-white ${muted ? "text-white/62" : "text-white/72"}`
        }`
      }
    >
      <As size={18} strokeWidth={2} />
      {children}
    </NavLink>
  );
}

function WorkItems() {
  return (
    <Group label="Work">
      <Item to="/app" icon={LayoutDashboard} end>
        Today
      </Item>
      <Item to="/app/schedule" icon={CalendarDays}>
        Schedule
      </Item>
      <Item to="/app/patients" icon={ContactRound}>
        Patients
      </Item>
      <FeatureGate flag="clinical">
        <Item to="/app/clinical-review" icon={Stethoscope}>
          Clinical review
        </Item>
      </FeatureGate>
      <Item to="/app/waitlist" icon={Hourglass}>
        Waitlist
      </Item>
      <PermissionGate capability="content.author">
        <Item to="/app/blog" icon={Newspaper}>
          Blog posts
        </Item>
      </PermissionGate>
      <FeatureGate flag="communications">
        <Item to="/app/communications/failures" icon={MessageSquareWarning}>
          Failed messages
        </Item>
      </FeatureGate>
    </Group>
  );
}

function AdminItems() {
  return (
    <Group label="Administration">
      <Item to="/admin" icon={Settings} end>
        Overview
      </Item>
      <Item to="/admin/users" icon={Users}>
        People &amp; access
      </Item>
      <Item to="/admin/scheduling" icon={CalendarCog}>
        Scheduling
      </Item>
      <Item to="/admin/service-pages" icon={PanelsTopLeft}>
        Content &amp; forms
      </Item>
      <FeatureGate flag="reporting">
        <Item to="/admin/dashboard" icon={ChartNoAxesColumn}>
          Insight
        </Item>
      </FeatureGate>
    </Group>
  );
}
