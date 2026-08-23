import {
  CalendarDays,
  ContactRound,
  Hourglass,
  MessageSquareWarning,
  Stethoscope,
} from "lucide-react";
import { HubCard, HubCardGrid } from "../../components/hub-card";
import { FeatureGate } from "../../lib/features";

export default function WorkforcePage() {
  return (
    <section>
      <h1 className="font-display text-3xl">Workforce</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Clinical and front-desk workspace.
      </p>
      <HubCardGrid>
        <HubCard
          to="/app/patients"
          icon={ContactRound}
          title="Patient registry"
          description="Look up patients and open their charts."
        />
        <FeatureGate flag="clinical">
          <HubCard
            to="/app/clinical-review"
            icon={Stethoscope}
            title="Clinical reconciliation"
            description="Review patient-reported allergy and medication changes."
          />
        </FeatureGate>
        <HubCard
          to="/app/schedule"
          icon={CalendarDays}
          title="Schedule"
          description="The practice calendar and appointment management."
        />
        <HubCard
          to="/app/waitlist"
          icon={Hourglass}
          title="Waitlist"
          description="Patients waiting for an earlier opening."
        />
        <FeatureGate flag="communications">
          <HubCard
            to="/app/communications/failures"
            icon={MessageSquareWarning}
            title="Failed communications"
            description="Retry or resolve reminders needing staff follow-up."
          />
        </FeatureGate>
      </HubCardGrid>
    </section>
  );
}
