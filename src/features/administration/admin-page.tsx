import {
  CalendarCog,
  FileText,
  MessageSquareText,
  LayoutDashboard,
  ChartNoAxesColumn,
  ScrollText,
  PackageSearch,
  PanelsTopLeft,
  ToggleLeft,
  Users,
} from "lucide-react";
import { HubCard, HubCardGrid } from "../../components/hub-card";
import { FeatureGate } from "../../lib/features";

export default function AdminPage() {
  return (
    <section>
      <h1 className="font-display text-3xl">Administration</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Practice configuration and user management.
      </p>
      <HubCardGrid>
        <HubCard
          to="/admin/users"
          icon={Users}
          title="Workforce users"
          description="Invite staff, manage roles and account status."
        />
        <FeatureGate flag="communications">
          <HubCard
            to="/admin/communications"
            icon={MessageSquareText}
            title="Communications"
            description="Manage neutral templates and reminder schedules."
          />
        </FeatureGate>
        <FeatureGate flag="intakeForms">
          <HubCard
            to="/admin/forms"
            icon={FileText}
            title="Form templates"
            description="Author and publish intake and consent forms."
          />
        </FeatureGate>
        <FeatureGate flag="reporting">
          <HubCard
            to="/admin/dashboard"
            icon={LayoutDashboard}
            title="Operations dashboard"
            description="Daily appointment, intake, message, and task counts."
          />
          <HubCard
            to="/admin/reports"
            icon={ChartNoAxesColumn}
            title="Reports"
            description="Utilization and completion measures with audited export."
          />
          <HubCard
            to="/admin/audit"
            icon={ScrollText}
            title="Audit review"
            description="Exports, role changes, overrides, and sensitive activity."
          />
        </FeatureGate>
        <HubCard
          to="/admin/services"
          icon={PackageSearch}
          title="Bookable services"
          description="Services, effective dates, and their linked configuration."
        />
        <HubCard
          to="/admin/service-pages"
          icon={PanelsTopLeft}
          title="Website services"
          description="Author and publish public website service content."
        />
        <HubCard
          to="/admin/feature-flags"
          icon={ToggleLeft}
          title="Features"
          description="Turn parts of the site on or off."
        />
        <HubCard
          to="/admin/scheduling"
          icon={CalendarCog}
          title="Scheduling configuration"
          description="Appointment types, provider availability and rules."
        />
      </HubCardGrid>
    </section>
  );
}
