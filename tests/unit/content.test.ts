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
    sortOrder: 0,
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
  ).toMatchObject({ sortOrder: 1 });
  expect(
    (await tx.run((ctx) => ctx.db.query("auditEvents").collect())).filter(
      (event) => event.action === "content.servicePage.created",
    ),
  ).toHaveLength(2);
});

test("service page creation advances from a negative sort order and rejects blank addresses", async () => {
  const tx = convexTest(schema, modules);
  const administrator = await seedUser(tx, ["administrator"], "content_sort");
  const createdByUserId = await tx.run(
    async (ctx) =>
      (await ctx.db
        .query("users")
        .withIndex("by_clerk_user_id", (q) =>
          q.eq("clerkUserId", "content_sort"),
        )
        .unique())!._id,
  );
  await tx.run(async (ctx) => {
    await ctx.db.insert("servicePages", {
      slug: "negative-four",
      sortOrder: -4,
      status: "draft",
      createdByUserId,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("servicePages", {
      slug: "negative-two",
      sortOrder: -2,
      status: "draft",
      createdByUserId,
      createdAt: 1,
      updatedAt: 1,
    });
  });

  const servicePageId = await administrator.mutation(
    api.domains.content.createServicePage,
    { title: "Next page" },
  );
  expect(
    await administrator.query(api.domains.content.getServicePage, {
      servicePageId,
    }),
  ).toMatchObject({ sortOrder: -1 });
  await expect(
    administrator.mutation(api.domains.content.createServicePage, {
      title: "!!!",
    }),
  ).rejects.toThrow("Title must include at least one letter or number");
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

async function exists(tx: ReturnType<typeof convexTest>, storageId: string) {
  return await tx.run(
    async (ctx) => (await ctx.db.system.get(storageId as never)) !== null,
  );
}

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
  await tx.run(async (ctx) => {
    const row = await ctx.db.get(servicePageId);
    await ctx.db.patch(servicePageId, {
      content: row!.draftContent,
      status: "published",
      publishedAt: 1,
    });
  });

  const page = await tx.query(api.domains.content.getPublishedServicePage, {
    slug: "image-service",
  });

  expect(page?.imageUrls[storageId]).toEqual(expect.any(String));
});

test("content image confirmation enforces capability, type, and size", async () => {
  const tx = convexTest(schema, modules);
  const administrator = await seedUser(tx, ["administrator"], "image_admin");
  const patient = await seedUser(tx, ["patient"], "image_patient");
  await expect(
    patient.mutation(api.domains.content.generateContentImageUploadUrl, {
      for: "servicePage",
    }),
  ).rejects.toThrow("Not authorized");

  const storageId = await tx.run((ctx) =>
    ctx.storage.store(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)])),
  );
  const result = await administrator.mutation(
    api.domains.content.confirmContentImage,
    { storageId, for: "servicePage" },
  );
  expect(result.ok).toBe(false);
  expect(await exists(tx, storageId)).toBe(false);
});

test("discarding a draft releases its unreferenced images", async () => {
  const tx = convexTest(schema, modules);
  const administrator = await seedUser(tx, ["administrator"], "image_release");
  const servicePageId = await administrator.mutation(
    api.domains.content.createServicePage,
    { title: "Image Release" },
  );
  await administrator.mutation(api.domains.content.saveServicePageDraft, {
    servicePageId,
    content,
  });
  await administrator.mutation(api.domains.content.publishServicePage, {
    servicePageId,
  });
  const storageId = await tx.run((ctx) =>
    ctx.storage.store(new Blob(["synthetic"], { type: "image/jpeg" })),
  );
  await administrator.mutation(api.domains.content.saveServicePageDraft, {
    servicePageId,
    content: {
      ...content,
      coverImage: { storageId, alt: "A welcoming office" },
    },
  });
  await administrator.mutation(api.domains.content.discardServicePageDraft, {
    servicePageId,
  });
  expect(await exists(tx, storageId)).toBe(false);
});
