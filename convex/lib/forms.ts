// Form definition model shared by the admin editor, the patient renderer,
// and Convex validation. Definitions are data, never executable code.

import { z } from "zod";

// Safe complexity limits so a crafted definition cannot degrade rendering
// or validation.
export const FORM_LIMITS = {
  maxSections: 20,
  maxFieldsTotal: 100,
  maxOptions: 50,
  maxLabelLength: 300,
  maxContentLength: 20_000,
} as const;

export const FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "multiselect",
  "checkbox",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

const text = (mode: "strict" | "draft") =>
  mode === "strict"
    ? z.string().trim().min(1).max(FORM_LIMITS.maxLabelLength)
    : z.string().max(FORM_LIMITS.maxLabelLength);

// Conditional visibility: show the field only when another field equals a
// value. Single-condition on purpose; rule chains are not needed yet.
const showIfSchema = z.object({
  fieldKey: z.string(),
  equals: z.union([z.string(), z.number(), z.boolean()]),
});

const formSchema = (mode: "strict" | "draft") => {
  const label = text(mode);
  const optionSchema = z.object({ value: label, label });
  const field = z
    .object({
      key: z
        .string()
        .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/, "Invalid field key"),
      label,
      type: z.enum(FIELD_TYPES),
      required: z.boolean().optional(),
      helpText: z.string().max(FORM_LIMITS.maxLabelLength).optional(),
      options: z.array(optionSchema).max(FORM_LIMITS.maxOptions).optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      maxLength: z.number().int().positive().max(10_000).optional(),
      showIf: showIfSchema.optional(),
    })
    .superRefine((field, ctx) => {
      const needsOptions =
        field.type === "select" || field.type === "multiselect";
      if (
        mode === "strict" &&
        needsOptions &&
        (!field.options || field.options.length === 0)
      ) {
        ctx.addIssue({
          code: "custom",
          message: `Field "${field.key}" requires options`,
        });
      }
      if (!needsOptions && field.options) {
        ctx.addIssue({
          code: "custom",
          message: `Field "${field.key}" does not take options`,
        });
      }
    });
  const section = z.object({
    title: label,
    content: z.string().max(FORM_LIMITS.maxContentLength).optional(),
    fields: z.array(field),
  });

  return z
    .object({
      sections: z
        .array(section)
        .min(mode === "strict" ? 1 : 0)
        .max(FORM_LIMITS.maxSections),
      // Deterministic scoring: sum of listed numeric fields. More rule types
      // can be added when an instrument needs them (8.1).
      scoreRule: z
        .object({ type: z.literal("sum"), fields: z.array(z.string()).min(1) })
        .optional(),
    })
    .superRefine((def, ctx) => {
      const fields = def.sections.flatMap((s) => s.fields);
      if (fields.length > FORM_LIMITS.maxFieldsTotal) {
        ctx.addIssue({ code: "custom", message: "Too many fields" });
      }
      const keys = new Set<string>();
      for (const [sectionIndex, section] of def.sections.entries()) {
        for (const [fieldIndex, f] of section.fields.entries()) {
          if (keys.has(f.key)) {
            ctx.addIssue({
              code: "custom",
              path: ["sections", sectionIndex, "fields", fieldIndex],
              message: `Duplicate key "${f.key}"`,
            });
          }
          keys.add(f.key);
        }
      }
      if (mode === "draft") return;
      for (const [sectionIndex, section] of def.sections.entries()) {
        for (const [fieldIndex, f] of section.fields.entries()) {
          if (f.showIf && !keys.has(f.showIf.fieldKey)) {
            ctx.addIssue({
              code: "custom",
              path: ["sections", sectionIndex, "fields", fieldIndex],
              message: `showIf references unknown field "${f.showIf.fieldKey}"`,
            });
          }
          if (f.showIf && f.showIf.fieldKey === f.key) {
            ctx.addIssue({
              code: "custom",
              path: ["sections", sectionIndex, "fields", fieldIndex],
              message: `Field "${f.key}" cannot depend on itself`,
            });
          }
        }
      }
      for (const key of def.scoreRule?.fields ?? []) {
        const target = fields.find((f) => f.key === key);
        if (!target || target.type !== "number") {
          ctx.addIssue({
            code: "custom",
            path: ["scoreRule"],
            message: `Score rule requires numeric field "${key}"`,
          });
        }
      }
    });
};

export const formDefinitionSchema = formSchema("strict");
export const formDraftSchema = formSchema("draft");
export const fieldSchema =
  formDefinitionSchema.shape.sections.element.shape.fields.element;

export type FormDefinition = z.infer<typeof formDefinitionSchema>;
export type FormField = z.infer<typeof fieldSchema>;

export function listDefinitionProblems(
  definition: unknown,
): { path: string; message: string }[] {
  const result = formDefinitionSchema.safeParse(definition);
  if (result.success) return [];
  return result.error.issues.map((issue) => {
    const sectionIndex = issue.path[1];
    const fieldIndex = issue.path[3];
    return {
      path:
        typeof sectionIndex !== "number"
          ? ""
          : typeof fieldIndex === "number"
            ? `field-${sectionIndex}-${fieldIndex}`
            : `section-${sectionIndex}`,
      message: issue.message,
    };
  });
}

export function deriveFieldKey(label: string, taken: Set<string>): string {
  let base = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (base && /^\d/.test(base)) base = `field_${base}`;
  if (!base) {
    let index = 1;
    while (taken.has(`field_${index}`)) index += 1;
    return `field_${index}`;
  }
  base = base.slice(0, 64);
  if (!taken.has(base)) return base;
  let index = 2;
  while (taken.has(`${base.slice(0, 63 - String(index).length)}_${index}`)) {
    index += 1;
  }
  return `${base.slice(0, 63 - String(index).length)}_${index}`;
}

/** Throws with readable messages when a definition is invalid. */
export function parseDefinition(definition: unknown): FormDefinition {
  const result = formDefinitionSchema.safeParse(definition);
  if (!result.success) {
    const message = result.error.issues
      .map((i) => i.message)
      .slice(0, 5)
      .join("; ");
    throw new Error(`Invalid form definition: ${message}`);
  }
  return result.data;
}

export type AnswerValue = string | number | boolean | string[];
export type Answers = Record<string, AnswerValue>;

export function isFieldVisible(field: FormField, answers: Answers): boolean {
  if (!field.showIf) return true;
  return answers[field.showIf.fieldKey] === field.showIf.equals;
}

function typeError(field: FormField, value: AnswerValue): string | null {
  switch (field.type) {
    case "text":
    case "textarea": {
      if (typeof value !== "string") return "must be text";
      const max = field.maxLength ?? FORM_LIMITS.maxContentLength;
      if (value.length > max) return `must be at most ${max} characters`;
      return null;
    }
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? null
        : "must be a date (YYYY-MM-DD)";
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return "must be a number";
      }
      if (field.min !== undefined && value < field.min) {
        return `must be at least ${field.min}`;
      }
      if (field.max !== undefined && value > field.max) {
        return `must be at most ${field.max}`;
      }
      return null;
    case "checkbox":
      return typeof value === "boolean" ? null : "must be true or false";
    case "select":
      return typeof value === "string" &&
        field.options!.some((o) => o.value === value)
        ? null
        : "must be one of the listed options";
    case "multiselect":
      return Array.isArray(value) &&
        value.every(
          (item) =>
            typeof item === "string" &&
            field.options!.some((o) => o.value === item),
        )
        ? null
        : "must be a list of the listed options";
  }
}

function isAnswered(field: FormField, value: AnswerValue | undefined): boolean {
  if (value === undefined) return false;
  if (field.type === "checkbox") return value === true;
  if (field.type === "multiselect") {
    return Array.isArray(value) && value.length > 0;
  }
  return value !== "";
}

/**
 * Validates answers against a definition. When `requireComplete`, every
 * required *visible* field must be answered (the completion rule); drafts
 * skip that check but still reject malformed or unknown values.
 */
export function validateAnswers(
  definition: FormDefinition,
  answers: Answers,
  { requireComplete }: { requireComplete: boolean },
): { key: string; message: string }[] {
  const errors: { key: string; message: string }[] = [];
  const fields = definition.sections.flatMap((s) => s.fields);
  const known = new Map(fields.map((f) => [f.key, f]));

  for (const key of Object.keys(answers)) {
    if (!known.has(key)) errors.push({ key, message: "Unknown field" });
  }
  for (const field of fields) {
    const value = answers[field.key];
    if (value !== undefined) {
      const problem = typeError(field, value);
      if (problem) errors.push({ key: field.key, message: problem });
    }
    if (
      requireComplete &&
      field.required &&
      isFieldVisible(field, answers) &&
      !isAnswered(field, value)
    ) {
      errors.push({ key: field.key, message: "This field is required" });
    }
  }
  return errors;
}

/** Deterministic score; unanswered/hidden numeric fields count as 0. */
export function computeScore(
  definition: FormDefinition,
  answers: Answers,
): number | undefined {
  if (!definition.scoreRule) return undefined;
  return definition.scoreRule.fields.reduce((sum, key) => {
    const value = answers[key];
    return sum + (typeof value === "number" ? value : 0);
  }, 0);
}
