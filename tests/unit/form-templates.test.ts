// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { parseDefinition } from "../../convex/lib/forms";
import schema from "../../convex/schema";
import { INTAKE_DEFINITION, seedUser } from "../fixtures/forms";

const modules = import.meta.glob("../../convex/**/*.ts");

test("invalid definitions are rejected with readable messages", () => {
  expect(() => parseDefinition({})).toThrow("Invalid form definition");
  // Duplicate keys
  expect(() =>
    parseDefinition({
      sections: [
        {
          title: "S",
          fields: [
            { key: "a", label: "A", type: "text" },
            { key: "a", label: "A2", type: "text" },
          ],
        },
      ],
    }),
  ).toThrow('Duplicate key "a"');
  // select requires options
  expect(() =>
    parseDefinition({
      sections: [
        { title: "S", fields: [{ key: "a", label: "A", type: "select" }] },
      ],
    }),
  ).toThrow("requires options");
  // showIf must reference a real field
  expect(() =>
    parseDefinition({
      sections: [
        {
          title: "S",
          fields: [
            {
              key: "a",
              label: "A",
              type: "text",
              showIf: { fieldKey: "ghost", equals: true },
            },
          ],
        },
      ],
    }),
  ).toThrow('unknown field "ghost"');
  // score rule must point at numeric fields
  expect(() =>
    parseDefinition({
      sections: [
        { title: "S", fields: [{ key: "a", label: "A", type: "text" }] },
      ],
      scoreRule: { type: "sum", fields: ["a"] },
    }),
  ).toThrow('numeric field "a"');
  // complexity limit
  expect(() =>
    parseDefinition({
      sections: Array.from({ length: 21 }, (_, i) => ({
        title: `S${i}`,
        fields: [],
      })),
    }),
  ).toThrow("Invalid form definition");
});

test("published versions are immutable; edits require a new draft", async () => {
  const tx = convexTest(schema, modules);
  const admin = await seedUser(tx, ["administrator"], "user_admin");

  const templateId = await admin.mutation(api.domains.forms.createTemplate, {
    name: "New Patient Intake",
    type: "intake",
  });
  const v1 = await admin.mutation(api.domains.forms.createDraftVersion, {
    templateId,
    definition: INTAKE_DEFINITION,
  });
  await admin.mutation(api.domains.forms.publishVersion, { versionId: v1 });

  // Direct edit of the published version fails.
  await expect(
    admin.mutation(api.domains.forms.updateDraftVersion, {
      versionId: v1,
      definition: INTAKE_DEFINITION,
    }),
  ).rejects.toThrow("Only draft versions can be edited");

  // A new draft can be created, edited, and published; v1 is superseded but
  // its content is unchanged.
  const v2 = await admin.mutation(api.domains.forms.createDraftVersion, {
    templateId,
  });
  await admin.mutation(api.domains.forms.updateDraftVersion, {
    versionId: v2,
    definition: {
      sections: [
        { title: "Only", fields: [{ key: "x", label: "X", type: "text" }] },
      ],
    },
  });
  await admin.mutation(api.domains.forms.publishVersion, { versionId: v2 });

  const detail = await admin.query(api.domains.forms.getTemplate, {
    templateId,
  });
  const first = detail?.versions.find((x) => x.version === 1);
  const second = detail?.versions.find((x) => x.version === 2);
  expect(first?.status).toBe("superseded");
  expect(first?.definition).toEqual(INTAKE_DEFINITION);
  expect(second?.status).toBe("published");
});

test("only form.manage roles can administer templates", async () => {
  const tx = convexTest(schema, modules);
  for (const role of ["patient", "frontDesk", "provider"] as const) {
    const user = await seedUser(tx, [role], `user_${role}`);
    await expect(
      user.mutation(api.domains.forms.createTemplate, {
        name: "X",
        type: "intake",
      }),
    ).rejects.toThrow("Not authorized");
  }
});

test("no second concurrent draft; invalid definitions rejected at write", async () => {
  const tx = convexTest(schema, modules);
  const admin = await seedUser(tx, ["administrator"], "user_admin");
  const templateId = await admin.mutation(api.domains.forms.createTemplate, {
    name: "T",
    type: "intake",
  });
  await admin.mutation(api.domains.forms.createDraftVersion, {
    templateId,
    definition: INTAKE_DEFINITION,
  });
  await expect(
    admin.mutation(api.domains.forms.createDraftVersion, { templateId }),
  ).rejects.toThrow("draft already exists");
  const detail = await admin.query(api.domains.forms.getTemplate, {
    templateId,
  });
  await expect(
    admin.mutation(api.domains.forms.updateDraftVersion, {
      versionId: detail!.versions[0]._id,
      definition: { sections: [] },
    }),
  ).rejects.toThrow("Invalid form definition");
});
