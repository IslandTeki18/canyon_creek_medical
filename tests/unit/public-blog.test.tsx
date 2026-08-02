import { fireEvent, render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { routes } from "../../src/routes";

const useQuery = vi.hoisted(() => vi.fn());

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery,
}));

const POST = {
  slug: "synthetic-public-article",
  title: "Synthetic whole-person care article",
  category: "Mental health" as const,
  excerpt: "Synthetic public excerpt.",
  body: "First synthetic paragraph.\n\nSecond synthetic paragraph.",
  authorName: "Synthetic Clinician",
  publishedAt: Date.UTC(2026, 7, 1, 18),
};

function renderAt(path: string) {
  render(
    <RouterProvider
      router={createMemoryRouter(routes, { initialEntries: [path] })}
    />,
  );
}

test("renders a successful public article route with semantic plain-text content", async () => {
  useQuery.mockReturnValue(POST);
  renderAt(`/blog/${POST.slug}`);

  expect(
    await screen.findByRole("heading", { level: 1, name: POST.title }),
  ).toBeDefined();
  expect(useQuery).toHaveBeenCalledWith(api.domains.blog.getPublishedPost, {
    slug: POST.slug,
  });
  expect(screen.getByRole("article")).toBeDefined();
  expect(screen.getByText(POST.category)).toBeDefined();
  expect(screen.getByText(POST.authorName)).toBeDefined();
  expect(screen.getByText("1 min read")).toBeDefined();
  expect(screen.getByText("First synthetic paragraph.").tagName).toBe("P");
  expect(screen.getByText("Second synthetic paragraph.").tagName).toBe("P");
  expect(
    screen.getByRole("link", { name: "← Back to journal" }),
  ).toHaveProperty("pathname", "/blog");
  expect(document.querySelector("time")?.getAttribute("dateTime")).toBe(
    new Date(POST.publishedAt).toISOString(),
  );
});

test("reports an empty selected category without replacing global empty behavior", async () => {
  useQuery.mockReturnValue([POST]);
  renderAt("/blog");
  await screen.findByRole("heading", {
    level: 1,
    name: "Notes on mind, body & recovery",
  });

  fireEvent.click(screen.getByRole("button", { name: "Practice news" }));
  expect(
    screen.getByRole("status", {
      name: "",
    }).textContent,
  ).toBe("No published posts in practice news yet.");
});

test("keeps the completely empty journal free of a category empty state", async () => {
  useQuery.mockReturnValue([]);
  renderAt("/blog");
  await screen.findByRole("heading", {
    level: 1,
    name: "Notes on mind, body & recovery",
  });

  expect(screen.queryByText(/No published posts in/)).toBeNull();
  expect(
    screen.getByRole("heading", {
      name: "Get thoughtful health writing in your inbox",
    }),
  ).toBeDefined();
});
