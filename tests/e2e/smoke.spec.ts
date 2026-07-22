import { expect, test } from "@playwright/test";

test("application loads and navigates between route groups", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Canyon Creek" }),
  ).toBeVisible();

  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Sign in" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Sign in" }),
  ).toBeVisible();

  await page.goto("/nonexistent");
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
});
