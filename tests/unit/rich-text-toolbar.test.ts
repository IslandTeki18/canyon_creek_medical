import { describe, expect, test } from "vitest";
import {
  applyInline,
  applyLink,
  toggleBlockPrefix,
} from "../../src/components/ui/rich-text-toolbar";

describe("rich text toolbar helpers", () => {
  test("wraps selected inline text and preserves its selection", () => {
    expect(applyInline("some text", 5, 9, "**", "**")).toEqual({
      text: "some **text**",
      selStart: 7,
      selEnd: 11,
    });
  });

  test("inserts inline markers around an empty selection", () => {
    expect(applyInline("text", 2, 2, "_", "_")).toEqual({
      text: "te__xt",
      selStart: 3,
      selEnd: 3,
    });
  });

  test("toggles and replaces the current block prefix", () => {
    expect(toggleBlockPrefix("first\n\nsecond", 9, "## ")).toEqual({
      text: "first\n\n## second",
      caret: 12,
    });
    expect(toggleBlockPrefix("### title", 6, "> ")).toEqual({
      text: "> title",
      caret: 4,
    });
    expect(toggleBlockPrefix("## title", 5, "## ")).toEqual({
      text: "title",
      caret: 2,
    });
  });

  test("creates links and selects placeholder text when needed", () => {
    expect(applyLink("read this", 5, 9, "https://example.com")).toEqual({
      text: "read [this](https://example.com)",
      selStart: 6,
      selEnd: 10,
    });
    expect(applyLink("read ", 5, 5, "/more")).toEqual({
      text: "read [link text](/more)",
      selStart: 6,
      selEnd: 15,
    });
  });
});
