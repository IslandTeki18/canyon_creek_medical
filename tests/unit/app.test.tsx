import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import App from "../../src/App";

test("renders the application shell", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "Canyon Creek" })).toBeDefined();
});
