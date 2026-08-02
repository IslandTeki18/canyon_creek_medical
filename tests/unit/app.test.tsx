import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { expect, test, vi } from "vitest";
import { routes } from "../../src/routes";

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: () => [],
}));

function renderAt(path: string) {
  render(
    <RouterProvider
      router={createMemoryRouter(routes, { initialEntries: [path] })}
    />,
  );
}

const LANDING_HEADING = "Whole-person care for the mind and the body.";

test.each([
  ["/", LANDING_HEADING],
  ["/services", "Comprehensive care, all in one practice"],
  ["/blog", "Notes on mind, body & recovery"],
  ["/sign-in", "Sign in"],
  ["/sign-up", "Create your account"],
])("renders %s route group", async (path, heading) => {
  renderAt(path);
  expect(
    await screen.findByRole("heading", { level: 1, name: heading }),
  ).toBeDefined();
});

// Without configured auth, protected route groups must never render their
// content — they render the sign-in-required notice instead.
test.each([["/portal"], ["/app"], ["/admin"]])(
  "blocks protected route %s when unauthenticated",
  async (path) => {
    renderAt(path);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Sign in required",
      }),
    ).toBeDefined();
    for (const name of ["Patient portal", "Workforce", "Administration"]) {
      expect(screen.queryByRole("heading", { name })).toBeNull();
    }
  },
);

test("renders not-found for unknown paths", async () => {
  renderAt("/nonexistent");
  expect(
    await screen.findByRole("heading", { name: "Page not found" }),
  ).toBeDefined();
});

test("shell exposes a skip link", async () => {
  renderAt("/");
  await screen.findByRole("heading", { level: 1, name: LANDING_HEADING });
  expect(screen.getByText("Skip to main content")).toBeDefined();
});
