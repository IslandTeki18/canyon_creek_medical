// Patient field policy and normalization — the single source of truth used
// by registration (2.2), search (2.3), and the patient portal (Increment 3).

/** Fields a patient may edit through the portal. Everything else is staff-only. */
export const PATIENT_EDITABLE_FIELDS = [
  "preferredName",
  "email",
  "phone",
] as const;

/** Staff-only identity fields; changes require staff capability + audit. */
export const STAFF_ONLY_FIELDS = [
  "legalFirstName",
  "legalLastName",
  "dateOfBirth",
  "status",
  "externalIds",
] as const;

export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Digits only; empty string treated as absent. */
export function normalizePhone(phone: string | undefined): string | undefined {
  const digits = phone?.replace(/\D/g, "");
  return digits ? digits : undefined;
}

export function normalizeEmail(email: string | undefined): string | undefined {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateOfBirth(dob: string): boolean {
  if (!ISO_DATE.test(dob)) return false;
  const time = Date.parse(`${dob}T00:00:00Z`);
  return !Number.isNaN(time) && time <= Date.now();
}

/** Combined lowercased text backing the patients search index. */
export function buildSearchText(p: {
  legalFirstName: string;
  legalLastName: string;
  preferredName?: string;
  dateOfBirth: string;
}): string {
  return [p.legalFirstName, p.preferredName, p.legalLastName, p.dateOfBirth]
    .filter(Boolean)
    .map((s) => s!.toLowerCase().trim())
    .join(" ");
}
