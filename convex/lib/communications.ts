export const APPROVED_TEMPLATE_VARIABLES = [
  "practiceName",
  "practicePhone",
  "appointmentDate",
  "appointmentTime",
] as const;

export type TemplateVariable = (typeof APPROVED_TEMPLATE_VARIABLES)[number];
export type TemplateValues = Partial<Record<TemplateVariable, string>>;

const VARIABLE_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g;
const APPROVED = new Set<string>(APPROVED_TEMPLATE_VARIABLES);
const PROHIBITED =
  /\b(diagnos\w*|medicat\w*|substance\w*|ketamine|treatment\w*|therapy|prescri\w*|clinical\w*)\b/i;

export function validateNeutralTemplate(
  subject: string | undefined,
  body: string,
): void {
  if (!body.trim()) throw new Error("Template body is required");
  if (subject !== undefined && !subject.trim()) {
    throw new Error("Email subject is required");
  }
  if (PROHIBITED.test(`${subject ?? ""} ${body}`)) {
    throw new Error("Template contains prohibited clinical wording");
  }
  for (const match of `${subject ?? ""} ${body}`.matchAll(VARIABLE_PATTERN)) {
    if (!APPROVED.has(match[1]!)) {
      throw new Error(`Unknown template variable: ${match[1]}`);
    }
  }
  if (`${subject ?? ""} ${body}`.includes("{{")) {
    const stripped = `${subject ?? ""} ${body}`.replace(VARIABLE_PATTERN, "");
    if (stripped.includes("{{")) throw new Error("Invalid template variable");
  }
}

export function renderNeutralTemplate(
  text: string,
  values: TemplateValues,
): string {
  validateNeutralTemplate(undefined, text);
  return text.replace(VARIABLE_PATTERN, (_, key: string) => {
    const value = values[key as TemplateVariable];
    if (!value) throw new Error(`Missing template variable: ${key}`);
    return value;
  });
}

export function communicationIdempotencyKey(parts: {
  intent: string;
  patientId: string;
  referenceId: string;
  channel: string;
  schedulePoint: number;
}): string {
  return [
    parts.intent,
    parts.patientId,
    parts.referenceId,
    parts.channel,
    parts.schedulePoint,
  ].join(":");
}

export function retryAt(now: number, attemptNumber: number): number | null {
  const minutes = [1, 5, 30][attemptNumber - 1];
  return minutes === undefined ? null : now + minutes * 60_000;
}

export type DeliveryErrorCategory = "transient" | "permanent";

export interface DeliveryResult {
  ok: boolean;
  providerMessageId?: string;
  category?: DeliveryErrorCategory;
  code?: string;
}
