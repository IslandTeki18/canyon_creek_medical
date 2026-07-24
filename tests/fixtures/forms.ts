// Synthetic form definitions and shared user seeding for form tests.
import type { convexTest } from "convex-test";
import type { FormDefinition } from "../../convex/lib/forms";
import type { Role } from "../../convex/lib/permissions";

export const INTAKE_DEFINITION: FormDefinition = {
  sections: [
    {
      title: "Basics",
      fields: [
        {
          key: "reason",
          label: "Reason for visit",
          type: "textarea",
          required: true,
        },
        {
          key: "sleepHours",
          label: "Average sleep (hours)",
          type: "number",
          required: true,
          min: 0,
          max: 24,
        },
        {
          key: "tobacco",
          label: "Do you use tobacco?",
          type: "select",
          required: true,
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ],
        },
        {
          key: "tobaccoType",
          label: "What kind?",
          type: "text",
          required: true,
          showIf: { fieldKey: "tobacco", equals: "yes" },
        },
      ],
    },
  ],
  scoreRule: { type: "sum", fields: ["sleepHours"] },
};

export const CONSENT_DEFINITION: FormDefinition = {
  sections: [
    {
      title: "Consent to Treatment",
      content:
        "Synthetic consent text describing treatment, risks, and alternatives.",
      fields: [],
    },
  ],
};

export async function seedUser(
  tx: ReturnType<typeof convexTest>,
  roles: Role[],
  clerkUserId: string,
  email?: string,
) {
  await tx.run(async (ctx) => {
    await ctx.db.insert("users", {
      clerkUserId,
      type: roles.includes("patient") ? "patient" : "workforce",
      status: "active",
      roles,
      displayName: `Synthetic ${clerkUserId}`,
      email,
      createdAt: 0,
      updatedAt: 0,
    });
  });
  return tx.withIdentity({ subject: clerkUserId });
}
