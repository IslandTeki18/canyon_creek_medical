export const inputClass = "mt-1 block w-full rounded border bg-card px-3 py-2";

export function TextField({
  label,
  value,
  onChange,
  required = false,
  hint,
  ...props
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  pattern?: string;
  disabled?: boolean;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} disabled:opacity-60`}
        {...props}
      />
      {hint && (
        <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
      )}
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  rows,
  id,
  hint,
  maxLength,
  textareaRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  id?: string;
  hint?: string;
  maxLength?: number;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <label className="block text-sm">
      {label}
      <textarea
        ref={textareaRef}
        id={id}
        rows={rows}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
      {hint && (
        <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
      )}
    </label>
  );
}

export function AddRow({
  onClick,
  label = "Add row",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-2 py-1 text-xs"
    >
      {label}
    </button>
  );
}

export function RemoveRow({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-1 rounded-full border px-2 py-1 text-xs"
    >
      Remove
    </button>
  );
}
import type { RefObject } from "react";
