// Shared form renderer: used by the patient intake flow and the admin
// preview so both always show identical output.
// ponytail: controlled component matching the codebase's form idiom instead
// of adding react-hook-form; revisit if per-field validation UX outgrows it.
import type {
  Answers,
  AnswerValue,
  FormDefinition,
  FormField,
} from "../../../convex/lib/forms";
import { isFieldVisible } from "../../../convex/lib/forms";

const inputCls = "mt-1 w-full rounded border px-2 py-1";

export function FormRenderer({
  definition,
  answers,
  onChange,
  errors = {},
  disabled = false,
}: {
  definition: FormDefinition;
  answers: Answers;
  onChange: (key: string, value: AnswerValue) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-6">
      {definition.sections.map((section) => (
        <fieldset key={section.title} className="space-y-3 border p-4">
          <legend className="font-medium">{section.title}</legend>
          {section.content && (
            <p className="text-sm whitespace-pre-wrap">{section.content}</p>
          )}
          {section.fields
            .filter((field) => isFieldVisible(field, answers))
            .map((field) => (
              <FieldInput
                key={field.key}
                field={field}
                value={answers[field.key]}
                onChange={(value) => onChange(field.key, value)}
                error={errors[field.key]}
                disabled={disabled}
              />
            ))}
        </fieldset>
      ))}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  error,
  disabled,
}: {
  field: FormField;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  error?: string;
  disabled: boolean;
}) {
  const errorId = error ? `${field.key}-error` : undefined;
  const common = {
    id: field.key,
    disabled,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": errorId,
  };

  let control: React.ReactNode;
  switch (field.type) {
    case "text":
      control = (
        <input
          {...common}
          value={(value as string) ?? ""}
          maxLength={field.maxLength}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
      );
      break;
    case "textarea":
      control = (
        <textarea
          {...common}
          value={(value as string) ?? ""}
          maxLength={field.maxLength}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
          rows={3}
        />
      );
      break;
    case "number":
      control = (
        <input
          {...common}
          type="number"
          value={typeof value === "number" ? value : ""}
          min={field.min}
          max={field.max}
          onChange={(e) =>
            onChange(e.target.value === "" ? "" : Number(e.target.value))
          }
          className={inputCls}
        />
      );
      break;
    case "date":
      control = (
        <input
          {...common}
          type="date"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
      );
      break;
    case "select":
      control = (
        <select
          {...common}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        >
          <option value="">Select…</option>
          {field.options!.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case "multiselect": {
      const selected = Array.isArray(value) ? value : [];
      control = (
        <div className="mt-1 space-y-1">
          {field.options!.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={disabled}
                checked={selected.includes(o.value)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...selected, o.value]
                      : selected.filter((s) => s !== o.value),
                  )
                }
              />
              {o.label}
            </label>
          ))}
        </div>
      );
      break;
    }
    case "checkbox":
      return (
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={disabled}
              checked={value === true}
              onChange={(e) => onChange(e.target.checked)}
              aria-invalid={error ? true : undefined}
              aria-describedby={errorId}
            />
            {field.label}
            {field.required && <span aria-hidden="true"> *</span>}
          </label>
          {field.helpText && (
            <p className="text-xs text-neutral-500">{field.helpText}</p>
          )}
          {error && (
            <p id={errorId} className="text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      );
  }

  return (
    <div>
      <label htmlFor={field.key} className="block text-sm">
        {field.label}
        {field.required && <span aria-hidden="true"> *</span>}
      </label>
      {field.helpText && (
        <p className="text-xs text-neutral-500">{field.helpText}</p>
      )}
      {control}
      {error && (
        <p id={errorId} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
