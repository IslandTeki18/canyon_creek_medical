import {
  CalendarCog,
  FileText,
  MessageSquareText,
  PackageSearch,
  ToggleLeft,
  Users,
} from "lucide-react";
import { HubCard, HubCardGrid } from "../../components/hub-card";

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
        <HubCard
          to="/admin/communications"
          icon={MessageSquareText}
          title="Communications"
          description="Manage neutral templates and reminder schedules."
        />
        <HubCard
          to="/admin/forms"
          icon={FileText}
          title="Form templates"
          description="Author and publish intake and consent forms."
        />
        <HubCard
          to="/admin/services"
          icon={PackageSearch}
          title="Service catalog"
          description="Services, effective dates, and their linked configuration."
        />
        <HubCard
          to="/admin/feature-flags"
          icon={ToggleLeft}
          title="Feature flags"
          description="Server-owned switches for unapproved modules."
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
