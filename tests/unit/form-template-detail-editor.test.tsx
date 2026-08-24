import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { DraftEditor } from "../../src/features/administration/form-template-detail-page";

const mutation = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useMutation: () => mutation,
}));

beforeEach(() => mutation.mockClear());

function renderEditor() {
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <DraftEditor
          draftId={"version" as never}
          definition={{ sections: [] }}
          updatedAt={Date.now()}
          template={{ name: "Intake", type: "intake", status: "active" }}
        />
      ),
    },
  ]);
  render(<RouterProvider router={router} />);
}

test("structural edits autosave and incomplete drafts cannot publish", async () => {
  renderEditor();

  fireEvent.click(screen.getByRole("button", { name: "Add section" }));
  await waitFor(() =>
    expect(mutation).toHaveBeenCalledWith({
      versionId: "version",
      definition: { sections: [{ title: "", fields: [] }] },
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Publish…" }));

  expect(
    await screen.findByRole("heading", {
      name: "Fix this draft before publishing",
    }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Publish version" }),
  ).not.toBeInTheDocument();
  expect(mutation).not.toHaveBeenCalledWith({ versionId: "version" });
});

test("advanced JSON updates the structured builder", () => {
  renderEditor();
  const json = screen.getByRole("textbox", {
    name: "Draft form definition (JSON)",
  });
  fireEvent.change(json, {
    target: { value: '{"sections":[{"title":"History","fields":[]}]}' },
  });
  fireEvent.blur(json);

  expect(screen.getByRole("textbox", { name: "Section title" })).toHaveValue(
    "History",
  );
});
