export const inputClass =
  "mt-1.75 block min-h-11 w-full rounded-xl border-[1.5px] border-ink/14 bg-field px-3.5 py-2.5 text-sm font-normal text-ink outline-none focus:border-primary";

export const fieldLabelClass = "block text-[13px] font-semibold";

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
  onBlur?: () => void;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className={fieldLabelClass}>
      {label}
      <input
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} disabled:opacity-60`}
        {...props}
      />
      {hint && (
        <span className="mt-1.5 block text-[11.5px] font-medium text-ink/55">
          {hint}
        </span>
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
    <label className={fieldLabelClass}>
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
        <span className="mt-1.5 block text-[11.5px] font-medium text-ink/55">
          {hint}
        </span>
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
      className="rounded-full border-[1.5px] border-ink/14 px-3 py-1.5 text-xs font-semibold hover:border-primary hover:text-primary"
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
      className="mb-1 rounded-full border-[1.5px] border-ink/14 px-3 py-1.5 text-xs font-semibold hover:border-primary hover:text-primary"
    >
      Remove
    </button>
  );
}
import type { RefObject } from "react";
