import { fireEvent, render, screen } from "@testing-library/react";
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

test("booking wizard walks all five steps to a received request", async () => {
  renderAt("/book");
  await screen.findByRole("heading", { level: 1, name: "Book an appointment" });

  // Step 1 — Continue is gated until a service is picked.
  const next = () => screen.getByRole("button", { name: /Continue|Confirm/ });
  expect(next()).toHaveProperty("disabled", true);
  fireEvent.click(screen.getByRole("button", { name: /Ketamine Therapy/ }));
  fireEvent.click(next());

  // Step 2 — provider.
  fireEvent.click(screen.getByRole("button", { name: /First available/ }));
  fireEvent.click(next());

  // Step 3 — date and time.
  await screen.findByText("Available times");
  expect(next()).toHaveProperty("disabled", true);
  const dates = screen
    .getAllByRole("button", { pressed: false })
    .filter((b) => /^[A-Z][a-z]{2}\d{1,2}[A-Z][a-z]{2}$/.test(b.textContent!));
  fireEvent.click(dates[0]);
  fireEvent.click(screen.getByRole("button", { name: "10:00 AM" }));
  fireEvent.click(next());

  // Step 4 — details; first name and email required.
  expect(next()).toHaveProperty("disabled", true);
  fireEvent.change(screen.getByLabelText("First name"), {
    target: { value: "Jane" },
  });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "jane@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm request" }));

  // Step 5 — confirmation, with the summary reflecting the choices.
  await screen.findByRole("heading", { name: "Request received" });
  expect(screen.getByText("Ketamine Therapy")).toBeDefined();
  expect(screen.getByText("First available")).toBeDefined();
  expect(screen.getByText(/· 10:00 AM/)).toBeDefined();
});

test("back returns to the previous step", async () => {
  renderAt("/book");
  await screen.findByRole("heading", { level: 1, name: "Book an appointment" });
  fireEvent.click(screen.getByRole("button", { name: /General consultation/ }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: "Choose a provider" });
  fireEvent.click(screen.getByRole("button", { name: "← Back" }));
  expect(
    await screen.findByRole("heading", {
      name: "Which service are you interested in?",
    }),
  ).toBeDefined();
});
