import { describe, expect, test } from "vitest";
import type { FormDefinition } from "../../convex/lib/forms";
import {
  addField,
  addSection,
  fieldsBefore,
  moveField,
  moveSection,
  numberFields,
  removeField,
  removeSection,
  updateField,
  updateSection,
} from "../../src/features/administration/form-builder";

const definition: FormDefinition = {
  sections: [
    {
      title: "First",
      fields: [
        {
          key: "choice",
          label: "Choice",
          type: "select",
          options: [{ label: "Yes", value: "Yes" }],
        },
        { key: "count", label: "Count", type: "number" },
      ],
    },
    {
      title: "Second",
      fields: [{ key: "agreed", label: "Agreed", type: "checkbox" }],
    },
  ],
};

describe("form builder state helpers", () => {
  test("add, update, remove, and move sections without mutating input", () => {
    const added = addSection(definition);
    expect(added.sections.at(-1)).toEqual({ title: "", fields: [] });
    expect(definition.sections).toHaveLength(2);
    expect(updateSection(added, 2, { title: "Third" }).sections[2].title).toBe(
      "Third",
    );
    expect(
      moveSection(definition, 1, 0).sections.map((section) => section.title),
    ).toEqual(["Second", "First"]);
    expect(
      removeSection(definition, 0).sections.map((section) => section.title),
    ).toEqual(["Second"]);
  });

  test("field helpers derive unique keys and preserve field order", () => {
    const added = addField(definition, 0, "text");
    expect(added.sections[0].fields.at(-1)).toEqual({
      key: "field_1",
      label: "",
      type: "text",
    });
    const updated = updateField(added, 0, 2, { label: "Name" });
    expect(updated.sections[0].fields[2]).toMatchObject({
      key: "field_1",
      label: "Name",
    });
    expect(
      moveField(updated, 0, 2, 0).sections[0].fields.map((field) => field.key),
    ).toEqual(["field_1", "choice", "count"]);
    expect(
      removeField(updated, 0, 1).sections[0].fields.map((field) => field.key),
    ).toEqual(["choice", "field_1"]);
  });

  test("candidate helpers return eligible earlier and numeric fields", () => {
    expect(fieldsBefore(definition, 1, 0).map((field) => field.key)).toEqual([
      "choice",
    ]);
    expect(numberFields(definition).map((field) => field.key)).toEqual([
      "count",
    ]);
  });
});
