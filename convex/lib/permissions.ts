// Role → capability configuration. Authorization decisions check
// capabilities, never role labels, so roles can be re-scoped in one place.
// Shared with the frontend for presentation-only gating; Convex functions
// always re-check server-side.

export const ROLES = ["administrator"] as const;
export type Role = (typeof ROLES)[number];

export const CAPABILITIES = ["config.manage", "content.author"] as const;
export type Capability = (typeof CAPABILITIES)[number];

const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  administrator: ["config.manage", "content.author"],
};

export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

export function capabilitiesForRoles(
  roles: readonly Role[],
): ReadonlySet<Capability> {
  return new Set(roles.flatMap((role) => ROLE_CAPABILITIES[role]));
}

export function hasCapability(
  roles: readonly Role[],
  capability: Capability,
): boolean {
  return capabilitiesForRoles(roles).has(capability);
}
