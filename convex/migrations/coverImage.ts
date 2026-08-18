import { internalMutation } from "../_generated/server";

function migrate(content: unknown) {
  if (typeof content !== "object" || content === null) return undefined;
  const record = content as Record<string, unknown>;
  if (record.coverImage !== undefined || record.imageStorageId === undefined) {
    return undefined;
  }
  const { imageStorageId, ...rest } = record;
  return { ...rest, coverImage: { storageId: imageStorageId, alt: "" } };
}

export const migrateCoverImages = internalMutation({
  args: {},
  handler: async (ctx) => {
    let blogPosts = 0;
    for (const post of await ctx.db.query("blogPosts").collect()) {
      const content = migrate(post.content);
      const draftContent = migrate(post.draftContent);
      if (content === undefined && draftContent === undefined) continue;
      await ctx.db.patch(post._id, {
        ...(content === undefined ? {} : { content }),
        ...(draftContent === undefined ? {} : { draftContent }),
      });
      blogPosts += 1;
    }
    return { blogPosts };
  },
});
