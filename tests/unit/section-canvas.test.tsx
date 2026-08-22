import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Section } from "../../convex/lib/content";
import { SectionCanvas } from "../../src/components/ui/section-canvas";

const sections: Section[] = [
  { id: "one", type: "richText", text: "One" },
  { id: "two", type: "calloutPanel", body: "Two" },
  { id: "three", type: "bulletList", items: ["Three"] },
];

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.useRealTimers());

function StatefulCanvas({
  onChange,
}: {
  onChange: (next: Section[], structural: boolean) => void;
}) {
  const [value, setValue] = useState(sections);
  return (
    <SectionCanvas
      sections={value}
      onChange={(next, structural) => {
        onChange(next, structural);
        setValue(next);
      }}
    />
  );
}

test("adds the selected section at the requested position", () => {
  const onChange = vi.fn();
  render(<SectionCanvas sections={sections} onChange={onChange} />);

  fireEvent.click(
    screen.getByRole("button", { name: "Add section at position 2" }),
  );
  fireEvent.click(screen.getByRole("menuitem", { name: /Callout panel/ }));

  const [next, structural] = onChange.mock.calls[0] as [Section[], boolean];
  expect(next.map(({ id }) => id)).toEqual([
    "one",
    expect.any(String),
    "two",
    "three",
  ]);
  expect(next[1]).toMatchObject({ type: "calloutPanel", body: "" });
  expect(structural).toBe(true);
});

test("arrow buttons swap sections and disable the outer bounds", () => {
  const onChange = vi.fn();
  render(<SectionCanvas sections={sections} onChange={onChange} />);

  expect(
    (
      screen.getByRole("button", {
        name: "Move section 1 up",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    (
      screen.getByRole("button", {
        name: "Move section 3 down",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Move section 1 down" }));
  fireEvent.click(screen.getByRole("button", { name: "Move section 2 up" }));

  expect(onChange).toHaveBeenCalledTimes(2);
  for (const [next, structural] of onChange.mock.calls as [
    Section[],
    boolean,
  ][]) {
    expect(next.map(({ id }) => id)).toEqual(["two", "one", "three"]);
    expect(structural).toBe(true);
  }
});

test("delete removes immediately and undo restores the original index", () => {
  const onChange = vi.fn();
  render(<StatefulCanvas onChange={onChange} />);

  fireEvent.click(screen.getByRole("button", { name: "Delete section 2" }));
  expect(onChange.mock.calls[0]?.[0].map(({ id }: Section) => id)).toEqual([
    "one",
    "three",
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(onChange.mock.calls[1]?.[0].map(({ id }: Section) => id)).toEqual([
    "one",
    "two",
    "three",
  ]);
  expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
});

test("delete toast expires after six seconds", async () => {
  vi.useFakeTimers();
  render(<StatefulCanvas onChange={vi.fn()} />);

  fireEvent.click(screen.getByRole("button", { name: "Delete section 2" }));
  await act(async () => vi.advanceTimersByTimeAsync(5_999));
  expect(screen.getByRole("button", { name: "Undo" })).toBeDefined();
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
});
