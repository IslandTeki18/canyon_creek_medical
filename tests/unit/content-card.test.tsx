import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ContentCard } from "../../src/components/ui/content-card";

test("content cards expose state and keyboard actions", () => {
  render(
    <ContentCard
      title="Synthetic service"
      summary="Synthetic summary"
      chips={["Synthetic chip"]}
      media={<span>Icon</span>}
      state="edited"
      primaryAction={<button>Publish edits</button>}
      menuActions={<button>Move earlier</button>}
    />,
  );

  expect(screen.getByText("Live · edited")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Publish edits" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Move earlier" })).toBeEnabled();
  expect(
    screen.getByText("More actions for Synthetic service"),
  ).toBeInTheDocument();
});
