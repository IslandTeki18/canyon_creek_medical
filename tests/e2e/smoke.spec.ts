import { expect, test } from "@playwright/test";

test("application loads and navigates between route groups", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Whole-person care for the mind and the body.",
    }),
  ).toBeVisible();

  // The landing page carries the marketing nav; the portal is its only routed
  // destination (public self-scheduling is deferred).
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Patient Portal" })
    .click();
  await expect(page).toHaveURL(/\/portal$/);

  await page.goto("/sign-in");
  await expect(
    // exact: the Clerk widget contributes its own "Sign in to ..." heading.
    page.getByRole("heading", { level: 1, name: "Sign in", exact: true }),
  ).toBeVisible();

  await page.goto("/nonexistent");
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
});
