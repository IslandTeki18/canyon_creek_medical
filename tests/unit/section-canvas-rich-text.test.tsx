import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SectionCanvas } from "../../src/components/ui/section-canvas";

test("shows rich text controls and warns about a skipped heading level", () => {
  render(
    <SectionCanvas
      sections={[{ id: "section-1", type: "richText", text: "### Details" }]}
      onChange={vi.fn()}
    />,
  );

  expect(screen.getByRole("button", { name: "Subheading" })).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain(
    "Add a heading before this subheading",
  );
});
