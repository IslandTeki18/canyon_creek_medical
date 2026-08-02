import { z } from "zod";

const nonEmpty = z.string().trim().min(1);

export const servicePageContentSchema = z
  .object({
    title: nonEmpty,
    icon: nonEmpty,
    summary: nonEmpty,
    chips: z.array(nonEmpty).max(12),
    tags: z
      .array(
        z.object({ label: nonEmpty, accent: z.boolean().optional() }).strict(),
      )
      .max(6),
    intro: nonEmpty,
    howItWorks: z.array(nonEmpty).min(1),
    indications: z.array(nonEmpty),
    steps: z
      .array(z.object({ title: nonEmpty, body: nonEmpty }).strict())
      .min(1),
    facts: z.array(z.object({ k: nonEmpty, v: nonEmpty }).strict()),
    safetyNote: nonEmpty,
  })
  .strict();

export type ServicePageContent = z.infer<typeof servicePageContentSchema>;

export function parseServicePageContent(raw: unknown): ServicePageContent {
  const result = servicePageContentSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    if (!issue) throw new Error("Invalid service page content");
    throw new Error(
      `Invalid service page content: ${issue.path.join(".")} — ${issue.message}`,
    );
  }
  return result.data;
}
