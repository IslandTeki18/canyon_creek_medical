// Role → capability configuration. Authorization decisions check
// capabilities, never role labels, so roles can be re-scoped in one place.
// Shared with the frontend for presentation-only gating; Convex functions
// always re-check server-side.

export const ROLES = [
  "patient",
  "frontDesk",
  "clinicalStaff",
  "provider",
  "administrator",
  "auditor",
] as const;
export type Role = (typeof ROLES)[number];

export const CAPABILITIES = [
  "portal.access",
  "patient.read",
  "patient.manage",
  "appointment.manage",
  "clinical.manage",
  "encounter.read",
  "encounter.write",
  "encounter.sign",
  "form.manage",
  "communication.manage",
  "config.manage",
  "user.manage",
  "audit.view",
  // Sensitive substance-use (MAT) records. Deliberately narrower than
  // clinical.manage: front desk and administrators do not hold it.
  "mat.access",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Runtime guard for capability names supplied as configuration data. */
export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  patient: ["portal.access"],
  frontDesk: [
    "patient.read",
    "patient.manage",
    "appointment.manage",
    "communication.manage",
  ],
  clinicalStaff: [
    "patient.read",
    "patient.manage",
    "appointment.manage",
    "communication.manage",
    "clinical.manage",
    "encounter.read",
    "mat.access",
  ],
  provider: [
    "patient.read",
    "patient.manage",
    "appointment.manage",
    "communication.manage",
    "clinical.manage",
    "encounter.read",
    "encounter.write",
    "encounter.sign",
    "mat.access",
  ],
  administrator: [
    "patient.read",
    "appointment.manage",
    "form.manage",
    "communication.manage",
    "config.manage",
    "user.manage",
    "audit.view",
  ],
  auditor: ["audit.view"],
};

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
