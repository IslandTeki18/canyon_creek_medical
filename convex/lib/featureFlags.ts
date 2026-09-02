// Server-owned feature flags (Increment 12.2). Definitions and environment
// defaults live in code; a stored row is an explicit override. Flags gate
// modules that are not yet clinically, legally, or operationally approved —
// they are never a substitute for authorization, so backend operations
// require the flag AND the caller's capability.

export const ENVIRONMENTS = [
  "development",
  "preview",
  "staging",
  "production",
] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export interface FlagDefinition {
  label: string;
  description?: string;
  /**
   * Regulated modules cannot be enabled in production without a recorded
   * approval (certification, protocol sign-off, or vendor agreement).
   */
  regulated: boolean;
  defaults: Record<Environment, boolean>;
}

const OFF: Record<Environment, boolean> = {
  development: false,
  preview: false,
  staging: false,
  production: false,
};

// Hidden in every environment unless an admin enables an override at
// /admin/feature-flags.
const PRACTICE_DEFAULTS: Record<Environment, boolean> = OFF;

export const FEATURE_FLAGS: Record<string, FlagDefinition> = {
  patientRegistry: {
    label: "Patient records",
    description:
      "Staff-facing patient list, chart and manual patient creation.",
    regulated: false,
    defaults: OFF,
  },
  scheduling: {
    label: "Appointment scheduling",
    description:
      "The older appointment calendar, appointment types and staff booking. Replaced by Bookings.",
    regulated: false,
    defaults: OFF,
  },
  waitlist: {
    label: "Waitlist",
    description: "Captured demand for appointment types.",
    regulated: false,
    defaults: OFF,
  },
  providerSchedules: {
    label: "Individual staff schedules",
    description:
      "Per-person working hours and time off. Booking uses practice hours instead.",
    regulated: false,
    defaults: OFF,
  },
  clinical: {
    label: "Clinical charting",
    description: "Charts, notes, ketamine and MAT queues for clinical staff.",
    regulated: false,
    defaults: PRACTICE_DEFAULTS,
  },
  intakeForms: {
    label: "Intake and consent forms",
    description: "Templates for patient intake forms and consents.",
    regulated: false,
    defaults: PRACTICE_DEFAULTS,
  },
  communications: {
    label: "Communication settings",
    description:
      "Reminder settings and failed-delivery review; scheduled reminders keep running.",
    regulated: false,
    defaults: PRACTICE_DEFAULTS,
  },
  reporting: {
    label: "Dashboard, reports and audit",
    description: "Operational dashboards, reports and activity review.",
    regulated: false,
    defaults: PRACTICE_DEFAULTS,
  },
  patientPortal: {
    label: "Patient portal",
    description: "Patient access to appointments, forms and health records.",
    regulated: false,
    defaults: PRACTICE_DEFAULTS,
  },
  // Deferred clinical services. Regulated: each needs external approval
  // before it may be switched on in production.
  spravato: { label: "Spravato (REMS)", regulated: true, defaults: OFF },
  hbot: { label: "Hyperbaric oxygen therapy", regulated: true, defaults: OFF },
  peptides: { label: "Peptide therapy", regulated: true, defaults: OFF },
  billing: { label: "Billing and payments", regulated: true, defaults: OFF },
  // Deferred product modules with no external regulator.
  secureMessaging: {
    label: "Secure patient messaging",
    regulated: false,
    defaults: OFF,
  },
  // Outbound vendor traffic. Preview deployments never send: they hold no
  // credentials, and this flag keeps that true even if credentials appear.
  integrations: {
    label: "Outbound integrations (SMS, email)",
    regulated: false,
    defaults: {
      development: true,
      preview: false,
      staging: true,
      production: true,
    },
  },
};

export type FlagKey = keyof typeof FEATURE_FLAGS;

export function isFlagKey(value: string): boolean {
  return Object.hasOwn(FEATURE_FLAGS, value);
}

/** The deployment's environment. Unset means a developer machine. */
export function currentEnvironment(): Environment {
  const value = process.env.APP_ENV;
  return (ENVIRONMENTS as readonly string[]).includes(value ?? "")
    ? (value as Environment)
    : "development";
}

export function defaultFor(key: string, environment: Environment): boolean {
  return FEATURE_FLAGS[key]?.defaults[environment] ?? false;
}
