/* oxlint-disable react/only-export-components -- helpers are public for unit tests */
import { useState, type MouseEvent, type RefObject } from "react";
import { Button } from "./button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./dialog";

export type TextSelection = {
  text: string;
  selStart: number;
  selEnd: number;
};

export function applyInline(
  text: string,
  selStart: number,
  selEnd: number,
  open: string,
  close: string,
): TextSelection {
  return {
    text:
      text.slice(0, selStart) +
      open +
      text.slice(selStart, selEnd) +
      close +
      text.slice(selEnd),
    selStart: selStart + open.length,
    selEnd: selEnd + open.length,
  };
}

export function toggleBlockPrefix(text: string, caret: number, prefix: string) {
  const priorBreaks = [...text.slice(0, caret).matchAll(/\n\s*\n/g)];
  const priorBreak = priorBreaks.at(-1);
  const blockStart = priorBreak
    ? (priorBreak.index ?? 0) + priorBreak[0].length
    : 0;
  const currentPrefix = ["### ", "## ", "> "].find((item) =>
    text.startsWith(item, blockStart),
  );
  const replacement = currentPrefix === prefix ? "" : prefix;
  const removeLength = currentPrefix?.length ?? 0;
  const delta = replacement.length - removeLength;

  return {
    text:
      text.slice(0, blockStart) +
      replacement +
      text.slice(blockStart + removeLength),
    caret: Math.max(blockStart, caret + delta),
  };
}

export function applyLink(
  text: string,
  selStart: number,
  selEnd: number,
  url: string,
): TextSelection {
  const label = text.slice(selStart, selEnd) || "link text";
  return {
    text: text.slice(0, selStart) + `[${label}](${url})` + text.slice(selEnd),
    selStart: selStart + 1,
    selEnd: selStart + 1 + label.length,
  };
}

export function RichTextToolbar({
  textareaRef,
  value,
  onChange,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (text: string) => void;
}) {
  const [linkSelection, setLinkSelection] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [url, setUrl] = useState("");

  function keepSelection(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  function restore(selection: { selStart: number; selEnd: number }) {
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(
        selection.selStart,
        selection.selEnd,
      );
      textareaRef.current?.focus();
    });
  }

  function formatInline(open: string, close: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const result = applyInline(
      value,
      textarea.selectionStart,
      textarea.selectionEnd,
      open,
      close,
    );
    onChange(result.text);
    restore(result);
  }

  function formatBlock(prefix: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const result = toggleBlockPrefix(value, textarea.selectionStart, prefix);
    onChange(result.text);
    restore({ selStart: result.caret, selEnd: result.caret });
  }

  function openLink() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    setLinkSelection({
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    });
    setUrl("");
  }

  function addLink() {
    if (!linkSelection) return;
    const result = applyLink(
      value,
      linkSelection.start,
      linkSelection.end,
      url,
    );
    onChange(result.text);
    setLinkSelection(null);
    restore(result);
  }

  const buttonProps = {
    type: "button" as const,
    variant: "outline" as const,
    size: "sm" as const,
    onMouseDown: keepSelection,
  };

  return (
    <>
      <div className="mb-1 flex flex-wrap gap-1" aria-label="Text formatting">
        <Button {...buttonProps} onClick={() => formatBlock("## ")}>
          Heading
        </Button>
        <Button {...buttonProps} onClick={() => formatBlock("### ")}>
          Subheading
        </Button>
        <Button {...buttonProps} onClick={() => formatBlock("> ")}>
          Quote
        </Button>
        <Button {...buttonProps} onClick={() => formatInline("**", "**")}>
          Bold
        </Button>
        <Button {...buttonProps} onClick={() => formatInline("_", "_")}>
          Italic
        </Button>
        <Button {...buttonProps} onClick={openLink}>
          Link
        </Button>
      </div>
      <Dialog
        open={linkSelection !== null}
        onOpenChange={(open) => !open && setLinkSelection(null)}
      >
        <DialogContent>
          <DialogTitle>Add link</DialogTitle>
          <DialogDescription>Enter the link destination.</DialogDescription>
          <label className="mt-4 block text-sm">
            URL
            <input
              autoFocus
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              className="mt-1 block w-full rounded border bg-card px-3 py-2"
            />
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" onClick={addLink}>
              Add link
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
