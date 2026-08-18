import { fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { RichTextToolbar } from "../../src/components/ui/rich-text-toolbar";

afterEach(() => vi.unstubAllGlobals());

function Harness() {
  const [value, setValue] = useState("some text");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  return (
    <>
      <RichTextToolbar
        textareaRef={textareaRef}
        value={value}
        onChange={setValue}
      />
      <textarea ref={textareaRef} value={value} readOnly />
    </>
  );
}

test("formats the textarea selection and restores focus", () => {
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frame = callback;
    return 0;
  });
  render(<Harness />);
  const textarea = screen.getByRole("textbox");
  textarea.setSelectionRange(5, 9);

  fireEvent.click(screen.getByRole("button", { name: "Bold" }));
  frame?.(0);

  expect((textarea as HTMLTextAreaElement).value).toBe("some **text**");
  expect(document.activeElement).toBe(textarea);
  expect(textarea.selectionStart).toBe(7);
  expect(textarea.selectionEnd).toBe(11);
});

test("adds a link through a dialog and cancel leaves text unchanged", () => {
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frame = callback;
    return 0;
  });
  render(<Harness />);
  const textarea = screen.getByRole("textbox");
  textarea.setSelectionRange(5, 9);

  fireEvent.click(screen.getByRole("button", { name: "Link" }));
  fireEvent.change(screen.getByRole("textbox", { name: "URL" }), {
    target: { value: "/details" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add link" }));
  frame?.(0);
  expect((textarea as HTMLTextAreaElement).value).toBe("some [text](/details)");

  fireEvent.click(screen.getByRole("button", { name: "Link" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect((textarea as HTMLTextAreaElement).value).toBe("some [text](/details)");
});
