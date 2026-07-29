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

export type Capability =
  | "portal.access"
  | "patient.read"
  | "patient.manage"
  | "appointment.manage"
  | "clinical.manage"
  | "encounter.read"
  | "encounter.write"
  | "encounter.sign"
  | "form.manage"
  | "communication.manage"
  | "config.manage"
  | "user.manage"
  | "audit.view";

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
