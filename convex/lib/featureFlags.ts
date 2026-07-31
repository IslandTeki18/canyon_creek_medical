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

export const FEATURE_FLAGS: Record<string, FlagDefinition> = {
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
