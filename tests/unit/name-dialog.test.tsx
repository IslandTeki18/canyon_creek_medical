import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { expect, test, vi } from "vitest";
import { NameDialog } from "../../src/components/ui/name-dialog";

test("creates a titled item and reports creation errors inline", async () => {
  const onCreate = vi
    .fn<(title: string) => Promise<string>>()
    .mockRejectedValueOnce(new Error("That path is already in use"))
    .mockResolvedValueOnce("created-id");
  const onCreated = vi.fn();
  render(
    <NameDialog
      title="New service page"
      pathPrefix="/services/"
      trigger={<button>New service page</button>}
      onCreate={onCreate}
      onCreated={onCreated}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "New service page" }));
  const create = screen.getByRole("button", { name: "Create" });
  expect(create).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
    target: { value: "  Ketamine Therapy  " },
  });
  expect(screen.getByText("/services/ketamine-therapy")).toBeInTheDocument();
  fireEvent.click(create);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "That path is already in use",
  );
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  fireEvent.click(create);

  await waitFor(() => expect(onCreated).toHaveBeenCalledWith("created-id"));
  expect(onCreate).toHaveBeenLastCalledWith("Ketamine Therapy");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("supports named admin items with an extra field and no public path", async () => {
  const onCreate = vi.fn().mockResolvedValue("template-id");
  render(
    <NameDialog
      title="New form template"
      description="Choose a name and type."
      trigger={<button>New template</button>}
      onCreate={onCreate}
      onCreated={vi.fn()}
    >
      <label>
        Type
        <select aria-label="Type">
          <option>Intake form</option>
        </select>
      </label>
    </NameDialog>,
  );

  fireEvent.click(screen.getByRole("button", { name: "New template" }));
  expect(screen.getByRole("combobox", { name: "Type" })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
    target: { value: "Test intake" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));

  await waitFor(() => expect(onCreate).toHaveBeenCalledWith("Test intake"));
  expect(screen.queryByText("/services/")).not.toBeInTheDocument();
});
