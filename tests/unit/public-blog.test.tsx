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
  sections: [
    {
      id: "body",
      type: "richText" as const,
      text: "First synthetic paragraph.\n\nSecond synthetic paragraph.",
    },
  ],
  authorName: "Synthetic Clinician",
  publishedAt: Date.UTC(2026, 7, 1, 18),
};

const LEGACY_POST = {
  ...POST,
  slug: "legacy-public-article",
  sections: undefined,
  body: "Legacy first paragraph.\n\nLegacy second paragraph.",
};

const LEGACY_SERVICE = {
  slug: "legacy-service",
  sortOrder: 1,
  content: {
    title: "Legacy Service",
    icon: "heart",
    summary: "Legacy summary",
    chips: [],
    tags: [],
    intro: "Legacy introduction",
    howItWorks: ["Legacy explanation"],
    indications: ["Legacy indication"],
    steps: [{ title: "Legacy step", body: "Legacy step details" }],
    facts: [],
    safetyNote: "Legacy safety note",
  },
};

function renderAt(path: string) {
  render(
    <RouterProvider
      router={createMemoryRouter(routes, { initialEntries: [path] })}
    />,
  );
}

test("renders a successful public article route with semantic plain-text content", async () => {
  // The api proxy mints fresh references, so dispatch on the args shape:
  // getPublishedPost is the only blog query called with a slug.
  useQuery.mockImplementation((_query, args) =>
    args && typeof args === "object" && "slug" in args ? POST : [POST],
  );
  renderAt(`/blog/${POST.slug}`);

  expect(
    await screen.findByRole("heading", { level: 1, name: POST.title }),
  ).toBeDefined();
  expect(useQuery).toHaveBeenCalledWith(api.domains.blog.getPublishedPost, {
    slug: POST.slug,
  });
  expect(screen.getByRole("article")).toBeDefined();
  // Category appears in the breadcrumb and as the header tag.
  expect(screen.getAllByText(POST.category).length).toBeGreaterThan(0);
  // Author name appears in the byline and the "Written by" strip.
  expect(screen.getAllByText(POST.authorName).length).toBeGreaterThan(0);
  expect(screen.getByText(/1 min read/)).toBeDefined();
  expect(screen.getByText("First synthetic paragraph.").tagName).toBe("P");
  expect(screen.getByText("Second synthetic paragraph.").tagName).toBe("P");
  expect(screen.getByRole("link", { name: "Journal" })).toHaveProperty(
    "pathname",
    "/blog",
  );
  expect(document.querySelector("time")?.getAttribute("dateTime")).toBe(
    new Date(POST.publishedAt).toISOString(),
  );
});

test("renders legacy nested blog content", async () => {
  useQuery.mockImplementation((_query, args) =>
    args && typeof args === "object" && "slug" in args
      ? LEGACY_POST
      : [LEGACY_POST],
  );
  renderAt(`/blog/${LEGACY_POST.slug}`);

  expect(await screen.findByText("Legacy first paragraph.")).toBeDefined();
  expect(screen.getByText("Legacy second paragraph.")).toBeDefined();
  expect(screen.getAllByText(/1 min read/).length).toBeGreaterThan(0);
});

test("renders legacy nested blog cards", async () => {
  useQuery.mockReturnValue([LEGACY_POST]);
  renderAt("/blog");

  expect(await screen.findByText(LEGACY_POST.title)).toBeDefined();
  expect(screen.getByText(/1 min read/)).toBeDefined();
});

test("renders legacy service article fields", async () => {
  useQuery.mockReturnValue(LEGACY_SERVICE);
  renderAt(`/services/${LEGACY_SERVICE.slug}`);

  expect(await screen.findByText("Legacy explanation")).toBeDefined();
  expect(screen.getByText("Legacy indication")).toBeDefined();
  expect(screen.getByText("Legacy step details")).toBeDefined();
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
