import { fireEvent, render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { routes } from "../../src/routes";

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: (_reference: unknown, args: Record<string, unknown>) =>
    "fromDate" in args
      ? [
          {
            startAt: 4_071_081_600_000,
            endAt: 4_071_085_200_000,
            date: "2099-01-01",
            localTime: "10:00",
            timeZone: "America/Denver",
          },
        ]
      : [
          { serviceId: "service-ketamine", name: "Ketamine Therapy" },
          { serviceId: "service-general", name: "General consultation" },
        ],
  useAction: () => async () => ({ ok: true }),
}));

function renderAt(path: string) {
  render(
    <RouterProvider
      router={createMemoryRouter(routes, { initialEntries: [path] })}
    />,
  );
}

beforeEach(() => {
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "test-site-key");
  window.turnstile = {
    render: (_container, options) => {
      options.callback("captcha-token");
      return "widget";
    },
    reset: vi.fn(),
    remove: vi.fn(),
  };
});

test("booking wizard walks all three steps to a confirmed booking", async () => {
  renderAt("/book");
  await screen.findByRole("heading", { level: 1, name: "Book an appointment" });

  const next = () =>
    screen.getByRole("button", { name: /Continue|Book appointment/ });
  expect(next()).toHaveProperty("disabled", true);
  fireEvent.click(screen.getByRole("button", { name: "Ketamine Therapy" }));
  fireEvent.click(next());

  await screen.findByText("Available times");
  expect(next()).toHaveProperty("disabled", true);
  fireEvent.click(screen.getByRole("button", { name: /Thu1Jan/ }));
  fireEvent.click(screen.getByRole("button", { name: "10:00" }));
  fireEvent.click(next());

  fireEvent.change(screen.getByLabelText("Full name"), {
    target: { value: "Jane Doe" },
  });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "jane@example.com" },
  });
  expect(next()).toHaveProperty("disabled", false);
  fireEvent.click(next());

  await screen.findByRole("heading", { name: "You're booked" });
  expect(screen.getByText(/Ketamine Therapy/)).toBeDefined();
  expect(screen.getByText(/2099-01-01 at 10:00/)).toBeDefined();
});

test("back returns to the previous step", async () => {
  renderAt("/book");
  await screen.findByRole("heading", { level: 1, name: "Book an appointment" });
  fireEvent.click(screen.getByRole("button", { name: "General consultation" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: "Pick a date & time" });
  fireEvent.click(screen.getByRole("button", { name: "← Back" }));
  expect(
    await screen.findByRole("heading", {
      name: "Which service are you interested in?",
    }),
  ).toBeDefined();
});
