import {
  deriveFieldKey,
  type FieldType,
  type FormDefinition,
  type FormField,
} from "../../../convex/lib/forms";

type Section = FormDefinition["sections"][number];

export function addSection(definition: FormDefinition): FormDefinition {
  return {
    ...definition,
    sections: [...definition.sections, { title: "", fields: [] }],
  };
}

export function removeSection(
  definition: FormDefinition,
  index: number,
): FormDefinition {
  return {
    ...definition,
    sections: definition.sections.filter((_, current) => current !== index),
  };
}

function move<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) {
    return items;
  }
  const next = [...items];
  const item = next.splice(from, 1)[0]!;
  next.splice(to, 0, item);
  return next;
}

export function moveSection(
  definition: FormDefinition,
  from: number,
  to: number,
): FormDefinition {
  return { ...definition, sections: move(definition.sections, from, to) };
}

export function updateSection(
  definition: FormDefinition,
  index: number,
  patch: Partial<Section>,
): FormDefinition {
  return {
    ...definition,
    sections: definition.sections.map((section, current) =>
      current === index ? { ...section, ...patch } : section,
    ),
  };
}

function updateFields(
  definition: FormDefinition,
  sectionIndex: number,
  update: (fields: FormField[]) => FormField[],
): FormDefinition {
  return updateSection(definition, sectionIndex, {
    fields: update(definition.sections[sectionIndex]!.fields),
  });
}

export function addField(
  definition: FormDefinition,
  sectionIndex: number,
  type: FieldType,
): FormDefinition {
  const taken = new Set(
    definition.sections.flatMap((section) =>
      section.fields.map((field) => field.key),
    ),
  );
  const field: FormField = {
    key: deriveFieldKey("", taken),
    label: "",
    type,
    ...(type === "select" || type === "multiselect" ? { options: [] } : {}),
  };
  return updateFields(definition, sectionIndex, (fields) => [...fields, field]);
}

export function removeField(
  definition: FormDefinition,
  sectionIndex: number,
  fieldIndex: number,
): FormDefinition {
  return updateFields(definition, sectionIndex, (fields) =>
    fields.filter((_, current) => current !== fieldIndex),
  );
}

export function moveField(
  definition: FormDefinition,
  sectionIndex: number,
  from: number,
  to: number,
): FormDefinition {
  return updateFields(definition, sectionIndex, (fields) =>
    move(fields, from, to),
  );
}

export function updateField(
  definition: FormDefinition,
  sectionIndex: number,
  fieldIndex: number,
  patch: Partial<FormField>,
): FormDefinition {
  return updateFields(definition, sectionIndex, (fields) =>
    fields.map((field, current) =>
      current === fieldIndex ? { ...field, ...patch } : field,
    ),
  );
}

export function fieldsBefore(
  definition: FormDefinition,
  sectionIndex: number,
  fieldIndex: number,
): FormField[] {
  return definition.sections
    .flatMap((section, currentSection) =>
      section.fields.slice(
        0,
        currentSection < sectionIndex
          ? undefined
          : currentSection === sectionIndex
            ? fieldIndex
            : 0,
      ),
    )
    .filter((field) => field.type === "select" || field.type === "checkbox");
}

export function numberFields(definition: FormDefinition): FormField[] {
  return definition.sections
    .flatMap((section) => section.fields)
    .filter((field) => field.type === "number");
}
