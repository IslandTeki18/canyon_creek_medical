// 13.6 — Automated accessibility checks across publicly renderable routes.
// Authenticated workflows (registration, booking, intake, encounter, session
// monitoring) are validated by the keyboard-only manual walkthroughs in
// docs/ACCESSIBILITY.md, which require staged Clerk accounts.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PUBLIC_ROUTES = [
  "/",
  "/about",
  "/services",
  "/blog",
  "/blog/synthetic-unpublished-post",
  "/book",
  "/sign-in",
  "/sign-up",
  "/nonexistent-route",
];

for (const route of PUBLIC_ROUTES) {
  test(`no serious or critical accessibility violations on ${route}`, async ({
    page,
  }) => {
    await page.goto(route);
    // Let lazy routes settle before scanning.
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const blocking = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(
      blocking.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.help}`),
    ).toEqual([]);
  });
}

test("keyboard users get a working skip link before the navigation", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: /skip to (main )?content/i });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content, main")).toBeVisible();
});
