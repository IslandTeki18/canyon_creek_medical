import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { expect, test } from "vitest";
import type { FormDefinition } from "../../convex/lib/forms";
import { FormBuilder } from "../../src/features/administration/form-builder.tsx";

function Builder({ initial = { sections: [] } }: { initial?: FormDefinition }) {
  const [definition, setDefinition] = useState(initial);
  return (
    <FormBuilder
      definition={definition}
      onChange={(next) => setDefinition(next)}
    />
  );
}

test("adds and edits every question type through structured controls", () => {
  render(<Builder />);

  fireEvent.click(screen.getByRole("button", { name: "Add section" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Section title" }), {
    target: { value: "Basics" },
  });
  for (const type of [
    "Short answer",
    "Long answer",
    "Number",
    "Date",
    "Choose one",
    "Choose many",
    "Yes/no",
  ]) {
    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    fireEvent.click(screen.getByRole("menuitem", { name: type }));
  }

  expect(screen.getAllByLabelText("Question label")).toHaveLength(7);
  fireEvent.change(screen.getAllByLabelText("Question label")[0]!, {
    target: { value: "Preferred pronouns" },
  });
  fireEvent.blur(screen.getAllByLabelText("Question label")[0]!);
  expect(screen.getByText("Key: preferred_pronouns")).toBeInTheDocument();
  expect(screen.getAllByText(/Key: field_/)).toHaveLength(6);
  expect(screen.getAllByRole("button", { name: "Add option" })).toHaveLength(2);
});

test("removes and restores a section", () => {
  const initial: FormDefinition = {
    sections: [{ title: "Basics", fields: [] }],
  };
  render(<Builder initial={initial} />);

  fireEvent.click(screen.getByRole("button", { name: "Delete section 1" }));
  expect(screen.queryByDisplayValue("Basics")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(screen.getByDisplayValue("Basics")).toBeInTheDocument();
});
