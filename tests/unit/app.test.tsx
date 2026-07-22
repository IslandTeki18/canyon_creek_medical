import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { expect, test } from "vitest";
import { routes } from "../../src/routes";

function renderAt(path: string) {
  render(
    <RouterProvider
      router={createMemoryRouter(routes, { initialEntries: [path] })}
    />,
  );
}

test.each([
  ["/", "Canyon Creek"],
  ["/sign-in", "Sign in"],
  ["/portal", "Patient portal"],
  ["/app", "Workforce"],
  ["/admin", "Administration"],
])("renders %s route group", async (path, heading) => {
  renderAt(path);
  expect(
    await screen.findByRole("heading", { level: 1, name: heading }),
  ).toBeDefined();
});

test("renders not-found for unknown paths", async () => {
  renderAt("/nonexistent");
  expect(
    await screen.findByRole("heading", { name: "Page not found" }),
  ).toBeDefined();
});

test("shell exposes a skip link", async () => {
  renderAt("/");
  await screen.findByRole("heading", { level: 1, name: "Canyon Creek" });
  expect(screen.getByText("Skip to main content")).toBeDefined();
});
