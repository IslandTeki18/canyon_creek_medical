// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";

const content = {
  title: "Ketamine Therapy",
  icon: "brain",
  summary: "Synthetic summary",
  chips: [],
  tags: [],
  intro: "Synthetic introduction",
  howItWorks: ["Synthetic explanation"],
  indications: [],
  steps: [{ title: "Step", body: "Synthetic body" }],
  facts: [],
  safetyNote: "Synthetic safety note",
};

const modules = import.meta.glob("../../convex/**/*.ts");

test("service page drafts do not change published content and can be discarded", async () => {
  const tx = convexTest(schema, modules);
  const administrator = await seedUser(tx, ["administrator"], "content_admin");
  const patient = await seedUser(tx, ["patient"], "content_patient");
  const servicePageId = await administrator.mutation(
    api.domains.content.createServicePage,
    { slug: "ketamine", sortOrder: 1, content },
  );

  await administrator.mutation(api.domains.content.publishServicePage, {
    servicePageId,
  });
  await administrator.mutation(api.domains.content.updateServicePage, {
    servicePageId,
    content: { ...content, title: "Unpublished title" },
  });

  expect(
    await tx.query(api.domains.content.getPublishedServicePage, {
      slug: "ketamine",
    }),
  ).toMatchObject({ content: { title: "Ketamine Therapy" } });
  expect(
    (
      await administrator.query(api.domains.content.getServicePage, {
        servicePageId,
      })
    )?.draftContent,
  ).toMatchObject({ title: "Unpublished title" });

  await expect(
    patient.mutation(api.domains.content.discardServicePageDraft, {
      servicePageId,
    }),
  ).rejects.toThrow("Not authorized");
  await administrator.mutation(api.domains.content.discardServicePageDraft, {
    servicePageId,
  });
  expect(
    (
      await administrator.query(api.domains.content.getServicePage, {
        servicePageId,
      })
    )?.draftContent,
  ).toBeUndefined();
});

test("service page drafts allow incomplete content but reject malformed structure", async () => {
  const tx = convexTest(schema, modules);
  const administrator = await seedUser(
    tx,
    ["administrator"],
    "partial_content",
  );
  const servicePageId = await administrator.mutation(
    api.domains.content.createServicePage,
    {
      slug: "partial",
      sortOrder: 1,
      content: {
        ...content,
        title: "",
        howItWorks: [],
        steps: [],
        safetyNote: "",
      },
    },
  );

  await expect(
    administrator.mutation(api.domains.content.publishServicePage, {
      servicePageId,
    }),
  ).rejects.toThrow(/Title is required[\s\S]*Safety note is required/);
  await expect(
    administrator.mutation(api.domains.content.updateServicePage, {
      servicePageId,
      content: { ...content, unknown: true },
    }),
  ).rejects.toThrow("Unrecognized key");
});
