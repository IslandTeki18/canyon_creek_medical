import { ConvexError } from "convex/values";
import { z } from "zod";
import type { Id } from "../_generated/dataModel";

const requiredText = (label: string) =>
  z.string().trim().min(1, `${label} is required`);
const draftText = () => z.string();
const nonEmpty = z.string().trim().min(1);
const blogCategory = z.enum([
  "Mental health",
  "Addiction medicine",
  "Holistic care",
  "Practice news",
]);

export const section = (s: z.ZodString, min: 0 | 1) =>
  z.discriminatedUnion("type", [
    z.object({ id: nonEmpty, type: z.literal("richText"), text: s }).strict(),
    z
      .object({
        id: nonEmpty,
        type: z.literal("numberedSteps"),
        steps: z.array(z.object({ title: s, body: s }).strict()).min(min),
      })
      .strict(),
    z
      .object({
        id: nonEmpty,
        type: z.literal("itemGrid"),
        items: z.array(s).min(min),
      })
      .strict(),
    z
      .object({
        id: nonEmpty,
        type: z.literal("calloutPanel"),
        title: z.string().optional(),
        body: s,
      })
      .strict(),
    z
      .object({
        id: nonEmpty,
        type: z.literal("image"),
        storageId: nonEmpty,
        alt: min === 1 ? nonEmpty : s,
      })
      .strict(),
    z
      .object({
        id: nonEmpty,
        type: z.literal("bulletList"),
        items: z.array(s).min(min),
      })
      .strict(),
  ]);

export type Section = z.infer<ReturnType<typeof section>>;
export type SectionType = Section["type"];

const blogPostSchema = (
  text: (label: string) => z.ZodString,
  requiredItems: 0 | 1,
) =>
  z
    .object({
      title: text("Title"),
      category: blogCategory,
      excerpt: text("Excerpt").max(
        300,
        "Excerpt must be at most 300 characters",
      ),
      authorName: text("Author name"),
      imageStorageId: z.custom<Id<"_storage">>().optional(),
      sections: z
        .array(section(text("Section text"), requiredItems))
        .min(requiredItems, "At least one section is required"),
    })
    .strict();

export const blogPostContentSchema = blogPostSchema(requiredText, 1);
export const blogPostDraftSchema = blogPostSchema(draftText, 0);

export type BlogPostContent = z.infer<typeof blogPostContentSchema>;

const servicePageSchema = (
  text: (label: string) => z.ZodString,
  requiredItems: 0 | 1,
) =>
  z
    .object({
      title: text("Title"),
      icon: text("Icon key"),
      summary: text("Summary"),
      chips: z.array(text("Chip")).max(12),
      tags: z
        .array(
          z
            .object({
              label: text("Tag label"),
              accent: z.boolean().optional(),
            })
            .strict(),
        )
        .max(6),
      intro: text("Introduction"),
      sections: z
        .array(section(text("Section text"), requiredItems))
        .min(requiredItems, "At least one section is required"),
      facts: z.array(
        z.object({ k: text("Fact label"), v: text("Fact value") }).strict(),
      ),
      safetyNote: text("Safety note"),
    })
    .strict();

export const servicePageContentSchema = servicePageSchema(requiredText, 1);
export const servicePageDraftSchema = servicePageSchema(draftText, 0);

export type ServicePageContent = z.infer<typeof servicePageContentSchema>;

function parseServicePage(
  schema: typeof servicePageContentSchema,
  raw: unknown,
  mode: "content" | "draft",
): ServicePageContent {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    if (mode === "content") {
      throw new ConvexError({ code: "PUBLISH_VALIDATION_FAILED", issues });
    }
    throw new Error(
      `Invalid service page ${mode}:\n${issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("\n")}`,
    );
  }
  return result.data;
}

export function parseServicePageContent(raw: unknown): ServicePageContent {
  return parseServicePage(servicePageContentSchema, raw, "content");
}

export function parseServicePageDraft(raw: unknown): ServicePageContent {
  return parseServicePage(servicePageDraftSchema, raw, "draft");
}
