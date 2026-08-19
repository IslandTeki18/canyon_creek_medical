import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ReasonDialog } from "../../src/components/ui/reason-dialog";

test("requires a reason and keeps failed actions in the dialog", async () => {
  const onConfirm = vi.fn().mockRejectedValue(new Error("Synthetic failure"));
  render(
    <ReasonDialog
      title="Archive item"
      confirmLabel="Archive"
      trigger={<button>Open</button>}
      onConfirm={onConfirm}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  const confirm = screen.getByRole("button", { name: "Archive" });
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), {
    target: { value: "  Synthetic reason  " },
  });
  fireEvent.click(confirm);

  await waitFor(() =>
    expect(onConfirm).toHaveBeenCalledWith("Synthetic reason"),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Synthetic failure",
  );
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
