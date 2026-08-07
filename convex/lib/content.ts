import { ConvexError } from "convex/values";
import { z } from "zod";

const requiredText = (label: string) =>
  z.string().trim().min(1, `${label} is required`);
const draftText = () => z.string();

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
      howItWorks: z
        .array(text("How it works item"))
        .min(requiredItems, "At least one how it works item is required"),
      indications: z.array(text("Indication")),
      steps: z
        .array(
          z
            .object({
              title: text("Step title"),
              body: text("Step body"),
            })
            .strict(),
        )
        .min(requiredItems, "At least one step is required"),
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
