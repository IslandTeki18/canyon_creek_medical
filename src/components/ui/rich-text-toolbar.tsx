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
