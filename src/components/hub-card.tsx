import { Link } from "react-router";
import { Icon, type IconType } from "../features/public/marketing-chrome";

/**
 * Clickable navigation card for the workforce and admin hub pages: Lucide
 * icon in a tinted circle, display-font title, muted description (Organic
 * card pattern, DESIGN.md).
 */
export function HubCard({
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
      className="rounded-organic flex flex-col gap-3 bg-card p-6 text-inherit no-underline shadow-organic-sm transition-shadow hover:shadow-organic-md"
    >
      <span className="grid size-12 place-items-center rounded-full bg-clay-100 text-clay-700">
        <Icon as={icon} />
      </span>
      <span className="font-display text-lg">{title}</span>
      <span className="text-sm text-muted-foreground">{description}</span>
    </Link>
  );
}

export function HubCardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  );
}
