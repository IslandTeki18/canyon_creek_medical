import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { hasCapability, type Capability } from "../../convex/lib/permissions";
import { useAuthConfigured } from "./auth";

/**
 * Presentation-only capability gate: hides UI the user cannot act on.
 * Authorization is enforced independently by every Convex function — this
 * component must never be the only check.
 */
export function PermissionGate({
  capability,
  children,
  fallback = null,
}: {
  capability: Capability;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const configured = useAuthConfigured();
  if (!configured) return fallback;
  return (
    <ConfiguredGate capability={capability} fallback={fallback}>
      {children}
    </ConfiguredGate>
  );
}

function ConfiguredGate({
  capability,
  children,
  fallback,
}: {
  capability: Capability;
  children: ReactNode;
  fallback: ReactNode;
}) {
  const user = useQuery(api.domains.users.currentUser);
  if (!user || !hasCapability(user.roles, capability)) return fallback;
  return children;
}
