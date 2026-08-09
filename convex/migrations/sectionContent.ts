import { internalMutation } from "../_generated/server";

type LegacyServiceContent = {
  howItWorks: string[];
  indications: string[];
  steps: { title: string; body: string }[];
  [key: string]: unknown;
};

type LegacyBlogContent = {
  body: string;
  [key: string]: unknown;
};

function hasSections(content: unknown): content is { sections: unknown } {
  return (
    typeof content === "object" && content !== null && "sections" in content
  );
}

function migrateServiceContent(content: unknown, idPrefix: string) {
  if (hasSections(content) || typeof content !== "object" || content === null) {
    return undefined;
  }
  const { howItWorks, indications, steps, ...rest } =
    content as LegacyServiceContent;
  return {
    ...rest,
    sections: [
      {
        id: `${idPrefix}-how-it-works`,
        type: "richText" as const,
        text: howItWorks.join("\n\n"),
      },
      {
        id: `${idPrefix}-indications`,
        type: "itemGrid" as const,
        items: indications,
      },
      {
        id: `${idPrefix}-steps`,
        type: "numberedSteps" as const,
        steps,
      },
    ],
  };
}

function migrateBlogContent(content: unknown, idPrefix: string) {
  if (hasSections(content) || typeof content !== "object" || content === null) {
    return undefined;
  }
  const { body, ...rest } = content as LegacyBlogContent;
  return {
    ...rest,
    sections: [
      { id: `${idPrefix}-body`, type: "richText" as const, text: body },
    ],
  };
}

export const migrate = internalMutation({
  args: {},
  handler: async (ctx) => {
    let servicePages = 0;
    let blogPosts = 0;

    for (const page of await ctx.db.query("servicePages").collect()) {
      const content = migrateServiceContent(
        page.content,
        `service-${page._id}`,
      );
      const draftContent = migrateServiceContent(
        page.draftContent,
        `service-${page._id}-draft`,
      );
      if (content === undefined && draftContent === undefined) continue;
      await ctx.db.patch(page._id, {
        ...(content === undefined ? {} : { content }),
        ...(draftContent === undefined ? {} : { draftContent }),
      });
      servicePages += 1;
    }

    for (const post of await ctx.db.query("blogPosts").collect()) {
      const content = migrateBlogContent(post.content, `blog-${post._id}`);
      const draftContent = migrateBlogContent(
        post.draftContent,
        `blog-${post._id}-draft`,
      );
      if (content === undefined && draftContent === undefined) continue;
      await ctx.db.patch(post._id, {
        ...(content === undefined ? {} : { content }),
        ...(draftContent === undefined ? {} : { draftContent }),
      });
      blogPosts += 1;
    }

    return { servicePages, blogPosts };
  },
});
