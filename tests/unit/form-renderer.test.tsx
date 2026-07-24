// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, test } from "vitest";
import type { Answers } from "../../convex/lib/forms";
import { FormRenderer } from "../../src/features/intake/form-renderer";
import { INTAKE_DEFINITION } from "../fixtures/forms";

function Harness() {
  const [answers, setAnswers] = useState<Answers>({});
  return (
    <FormRenderer
      definition={INTAKE_DEFINITION}
      answers={answers}
      onChange={(key, value) => setAnswers((a) => ({ ...a, [key]: value }))}
    />
  );
}

test("renders fields and reveals conditional fields when triggered", () => {
  render(<Harness />);
  expect(screen.getByLabelText(/Reason for visit/)).toBeInTheDocument();
  expect(screen.queryByLabelText(/What kind\?/)).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/tobacco/i), {
    target: { value: "yes" },
  });
  expect(screen.getByLabelText(/What kind\?/)).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/tobacco/i), {
    target: { value: "no" },
  });
  expect(screen.queryByLabelText(/What kind\?/)).not.toBeInTheDocument();
});

test("shows field errors accessibly", () => {
  render(
    <FormRenderer
      definition={INTAKE_DEFINITION}
      answers={{}}
      onChange={() => {}}
      errors={{ reason: "This field is required" }}
    />,
  );
  const input = screen.getByLabelText(/Reason for visit/);
  expect(input).toHaveAccessibleDescription("This field is required");
  expect(input).toHaveAttribute("aria-invalid", "true");
});
