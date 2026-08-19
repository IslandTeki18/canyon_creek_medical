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
  sections: [
    {
      id: "how-it-works",
      type: "richText" as const,
      text: "Synthetic explanation",
    },
    {
      id: "indications",
      type: "itemGrid" as const,
      items: ["Synthetic indication"],
    },
    {
      id: "steps",
      type: "numberedSteps" as const,
      steps: [{ title: "Step", body: "Synthetic body" }],
    },
  ],
  facts: [],
  safetyNote: "Synthetic safety note",
};

const modules = import.meta.glob("../../convex/**/*.ts");

test("service page creation derives a unique address, drafts empty content, orders pages, and audits", async () => {
  const tx = convexTest(schema, modules);
  const administrator = await seedUser(tx, ["administrator"], "content_create");
  const firstId = await administrator.mutation(
    api.domains.content.createServicePage,
    { title: "Ketamine Therapy" },
  );
  const secondId = await administrator.mutation(
    api.domains.content.createServicePage,
    { title: "Medication Management" },
  );

  await expect(
    administrator.mutation(api.domains.content.createServicePage, {
      title: "Ketamine therapy",
    }),
  ).rejects.toThrow("A page with this address already exists");

  expect(
    await administrator.query(api.domains.content.getServicePage, {
      servicePageId: firstId,
    }),
  ).toMatchObject({
    slug: "ketamine-therapy",
    sortOrder: 1,
    draftContent: {
      title: "Ketamine Therapy",
      icon: "",
      summary: "",
      chips: [],
      tags: [],
      intro: "",
      sections: [],
      facts: [],
      safetyNote: "",
    },
  });
  expect(
    await administrator.query(api.domains.content.getServicePage, {
      servicePageId: secondId,
    }),
  ).toMatchObject({ sortOrder: 2 });
  expect(
    (await tx.run((ctx) => ctx.db.query("auditEvents").collect())).filter(
      (event) => event.action === "content.servicePage.created",
    ),
  ).toHaveLength(2);
});

test("service page creation requires config.manage", async () => {
  const tx = convexTest(schema, modules);
  const patient = await seedUser(tx, ["patient"], "content_create_patient");

  await expect(
    patient.mutation(api.domains.content.createServicePage, {
      title: "Denied page",
    }),
  ).rejects.toThrow("Not authorized");
});

test("service page drafts do not change published content and can be discarded", async () => {
  const tx = convexTest(schema, modules);
  const administrator = await seedUser(tx, ["administrator"], "content_admin");
  const patient = await seedUser(tx, ["patient"], "content_patient");
  const servicePageId = await administrator.mutation(
    api.domains.content.createServicePage,
    { title: content.title },
  );
  await administrator.mutation(api.domains.content.saveServicePageDraft, {
    servicePageId,
    content,
  });

  await administrator.mutation(api.domains.content.publishServicePage, {
    servicePageId,
  });
  await administrator.mutation(api.domains.content.saveServicePageDraft, {
    servicePageId,
    content: { ...content, title: "Unpublished title" },
  });

  expect(
    await tx.query(api.domains.content.getPublishedServicePage, {
      slug: "ketamine-therapy",
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
    { title: "Partial" },
  );
  await administrator.mutation(api.domains.content.saveServicePageDraft, {
    servicePageId,
    content: {
      ...content,
      title: "",
      sections: [],
      safetyNote: "",
    },
  });

  await expect(
    administrator.mutation(api.domains.content.publishServicePage, {
      servicePageId,
    }),
  ).rejects.toThrow(
    /Title is required[\s\S]*At least one section is required[\s\S]*Safety note is required/,
  );
  await expect(
    administrator.mutation(api.domains.content.saveServicePageDraft, {
      servicePageId,
      content: { ...content, unknown: true },
    }),
  ).rejects.toThrow("Unrecognized key");
});

test("published service pages return resolved image URLs for image sections", async () => {
  const tx = convexTest(schema, modules);
  const administrator = await seedUser(tx, ["administrator"], "service_images");
  const storageId = await tx.run(async (ctx) =>
    ctx.storage.store(new Blob(["synthetic"], { type: "image/jpeg" })),
  );
  const servicePageId = await administrator.mutation(
    api.domains.content.createServicePage,
    { title: "Image Service" },
  );
  await administrator.mutation(api.domains.content.saveServicePageDraft, {
    servicePageId,
    content: {
      ...content,
      sections: [
        ...content.sections,
        {
          id: "treatment-room",
          type: "image",
          storageId,
          alt: "A calm treatment room",
        },
      ],
    },
  });
  await administrator.mutation(api.domains.content.publishServicePage, {
    servicePageId,
  });

  const page = await tx.query(api.domains.content.getPublishedServicePage, {
    slug: "image-service",
  });

  expect(page?.imageUrls[storageId]).toEqual(expect.any(String));
});
