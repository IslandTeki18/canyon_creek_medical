import { useCallback, useRef, useState, type ReactNode } from "react";
import type {
  FieldType,
  FormDefinition,
  FormField,
} from "../../../convex/lib/forms";
import { deriveFieldKey } from "../../../convex/lib/forms";
import {
  AddRow,
  RemoveRow,
  TextArea,
  TextField,
  inputClass,
} from "../../components/ui/field";
import { Toast, type ToastState } from "../../components/ui/toast";
import {
  addField,
  addSection,
  fieldsBefore,
  moveField,
  moveSection,
  removeField,
  removeSection,
  updateField,
  updateSection,
} from "./form-builder";

const questionTypes: { type: FieldType; label: string }[] = [
  { type: "text", label: "Short answer" },
  { type: "textarea", label: "Long answer" },
  { type: "number", label: "Number" },
  { type: "date", label: "Date" },
  { type: "select", label: "Choose one" },
  { type: "multiselect", label: "Choose many" },
  { type: "checkbox", label: "Yes/no" },
];

export function FormBuilder({
  definition,
  onChange,
}: {
  definition: FormDefinition;
  onChange: (next: FormDefinition, structural: boolean) => void;
}) {
  const [menuSection, setMenuSection] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const latest = useRef(definition);
  latest.current = definition;
  const dismissToast = useCallback(() => setToast(null), []);

  function removeWithUndo(
    next: FormDefinition,
    message: string,
    restore: (current: FormDefinition) => FormDefinition,
  ) {
    onChange(next, true);
    setToast({
      message,
      actionLabel: "Undo",
      onAction: () => onChange(restore(latest.current), true),
    });
  }

  return (
    <div className="space-y-4">
      {definition.sections.length === 0 && (
        <p className="text-sm text-muted-foreground">
          This form has no sections yet.
        </p>
      )}
      {definition.sections.map((section, sectionIndex) => (
        <section
          id={`section-${sectionIndex}`}
          key={sectionIndex}
          className="rounded border bg-card"
        >
          <div className="flex items-center gap-1 border-b px-3 py-2">
            <span className="mr-auto text-sm font-medium">
              Section {sectionIndex + 1}
            </span>
            <MoveButton
              label={`Move section ${sectionIndex + 1} up`}
              disabled={sectionIndex === 0}
              onClick={() =>
                onChange(
                  moveSection(definition, sectionIndex, sectionIndex - 1),
                  true,
                )
              }
            >
              ↑
            </MoveButton>
            <MoveButton
              label={`Move section ${sectionIndex + 1} down`}
              disabled={sectionIndex === definition.sections.length - 1}
              onClick={() =>
                onChange(
                  moveSection(definition, sectionIndex, sectionIndex + 1),
                  true,
                )
              }
            >
              ↓
            </MoveButton>
            <button
              type="button"
              aria-label={`Delete section ${sectionIndex + 1}`}
              className="rounded px-2 py-1 text-sm text-destructive"
              onClick={() => {
                const removed = section;
                removeWithUndo(
                  removeSection(definition, sectionIndex),
                  "Section deleted",
                  (current) => {
                    const sections = [...current.sections];
                    sections.splice(
                      Math.min(sectionIndex, sections.length),
                      0,
                      removed,
                    );
                    return { ...current, sections };
                  },
                );
              }}
            >
              Delete
            </button>
          </div>
          <div className="space-y-4 p-4">
            <TextField
              id={`section-${sectionIndex}-title`}
              label="Section title"
              value={section.title}
              onChange={(title) =>
                onChange(
                  updateSection(definition, sectionIndex, { title }),
                  false,
                )
              }
            />
            <TextArea
              label="Text shown above the questions"
              value={section.content ?? ""}
              rows={3}
              onChange={(content) =>
                onChange(
                  updateSection(definition, sectionIndex, { content }),
                  false,
                )
              }
            />
            {section.fields.map((field, fieldIndex) => (
              <FieldEditor
                key={field.key}
                definition={definition}
                sectionIndex={sectionIndex}
                fieldIndex={fieldIndex}
                field={field}
                onChange={onChange}
                onRemove={() => {
                  const removed = field;
                  removeWithUndo(
                    removeField(definition, sectionIndex, fieldIndex),
                    "Question deleted",
                    (current) => {
                      const fields = [
                        ...current.sections[sectionIndex]!.fields,
                      ];
                      fields.splice(
                        Math.min(fieldIndex, fields.length),
                        0,
                        removed,
                      );
                      return updateSection(current, sectionIndex, { fields });
                    },
                  );
                }}
              />
            ))}
            <div>
              <AddRow
                label="Add question"
                onClick={() =>
                  setMenuSection(
                    menuSection === sectionIndex ? null : sectionIndex,
                  )
                }
              />
              {menuSection === sectionIndex && (
                <ul
                  role="menu"
                  className="mt-2 w-52 rounded border bg-card p-1"
                >
                  {questionTypes.map(({ type, label }) => (
                    <li key={type} role="none">
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full rounded px-3 py-1.5 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          onChange(
                            addField(definition, sectionIndex, type),
                            true,
                          );
                          setMenuSection(null);
                        }}
                      >
                        {label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      ))}
      <AddRow
        label="Add section"
        onClick={() => onChange(addSection(definition), true)}
      />
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}

function MoveButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded px-2 py-1 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function optionalNumber(value: string): number | undefined {
  return value === "" ? undefined : Number(value);
}

function FieldEditor({
  definition,
  sectionIndex,
  fieldIndex,
  field,
  onChange,
  onRemove,
}: {
  definition: FormDefinition;
  sectionIndex: number;
  fieldIndex: number;
  field: FormField;
  onChange: (next: FormDefinition, structural: boolean) => void;
  onRemove: () => void;
}) {
  const candidates = fieldsBefore(definition, sectionIndex, fieldIndex);
  const update = (patch: Partial<FormField>, structural = false) =>
    onChange(
      updateField(definition, sectionIndex, fieldIndex, patch),
      structural,
    );
  return (
    <div
      id={`field-${sectionIndex}-${fieldIndex}`}
      className="space-y-3 rounded border p-3"
    >
      <div className="flex items-center gap-1">
        <span className="mr-auto text-xs font-medium text-muted-foreground">
          {questionTypes.find(({ type }) => type === field.type)?.label}
        </span>
        <MoveButton
          label={`Move question ${fieldIndex + 1} up`}
          disabled={fieldIndex === 0}
          onClick={() =>
            onChange(
              moveField(definition, sectionIndex, fieldIndex, fieldIndex - 1),
              true,
            )
          }
        >
          ↑
        </MoveButton>
        <MoveButton
          label={`Move question ${fieldIndex + 1} down`}
          disabled={
            fieldIndex === definition.sections[sectionIndex]!.fields.length - 1
          }
          onClick={() =>
            onChange(
              moveField(definition, sectionIndex, fieldIndex, fieldIndex + 1),
              true,
            )
          }
        >
          ↓
        </MoveButton>
        <RemoveRow onClick={onRemove} />
      </div>
      <TextField
        id={`field-${sectionIndex}-${fieldIndex}-label`}
        label="Question label"
        value={field.label}
        onChange={(label) => {
          const taken = new Set(
            definition.sections.flatMap((section) =>
              section.fields
                .filter((candidate) => candidate.key !== field.key)
                .map((candidate) => candidate.key),
            ),
          );
          update({
            label,
            ...(field.label === "" && label.trim()
              ? { key: deriveFieldKey(label, taken) }
              : {}),
          });
        }}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={field.required ?? false}
          onChange={(event) => update({ required: event.target.checked })}
        />
        Required
      </label>
      <TextField
        label="Help text"
        value={field.helpText ?? ""}
        onChange={(helpText) => update({ helpText })}
      />
      {(field.type === "select" || field.type === "multiselect") && (
        <OptionEditor field={field} update={update} />
      )}
      {field.type === "number" && (
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Minimum"
            value={field.min}
            onChange={(min) => update({ min })}
          />
          <NumberField
            label="Maximum"
            value={field.max}
            onChange={(max) => update({ max })}
          />
        </div>
      )}
      {(field.type === "text" || field.type === "textarea") && (
        <NumberField
          label="Maximum length"
          value={field.maxLength}
          min={1}
          onChange={(maxLength) => update({ maxLength })}
        />
      )}
      <label className="block text-sm">
        Only show when
        <select
          className={inputClass}
          value={field.showIf?.fieldKey ?? ""}
          onChange={(event) => {
            const target = candidates.find(
              (candidate) => candidate.key === event.target.value,
            );
            update(
              {
                showIf: target
                  ? {
                      fieldKey: target.key,
                      equals: target.type === "checkbox" ? true : "",
                    }
                  : undefined,
              },
              true,
            );
          }}
        >
          <option value="">Always show</option>
          {candidates.map((candidate) => (
            <option key={candidate.key} value={candidate.key}>
              {candidate.label || candidate.key}
            </option>
          ))}
        </select>
      </label>
      {field.showIf && (
        <ConditionValue
          target={candidates.find(
            (candidate) => candidate.key === field.showIf?.fieldKey,
          )}
          value={field.showIf.equals}
          onChange={(equals) =>
            update({ showIf: { ...field.showIf!, equals } })
          }
        />
      )}
      <details>
        <summary className="cursor-pointer text-sm">Advanced</summary>
        <p className="mt-2 text-xs text-muted-foreground">Key: {field.key}</p>
      </details>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value?: number;
  min?: number;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        type="number"
        min={min}
        value={value ?? ""}
        onChange={(event) => onChange(optionalNumber(event.target.value))}
        className={inputClass}
      />
    </label>
  );
}

function OptionEditor({
  field,
  update,
}: {
  field: FormField;
  update: (patch: Partial<FormField>, structural?: boolean) => void;
}) {
  const options = field.options ?? [];
  return (
    <div className="space-y-2">
      <span className="text-sm">Options</span>
      {options.map((option, index) => (
        <div key={index} className="flex items-end gap-2">
          <TextField
            label={`Option ${index + 1}`}
            value={option.label}
            onChange={(label) =>
              update({
                options: options.map((current, currentIndex) =>
                  currentIndex === index ? { label, value: label } : current,
                ),
              })
            }
          />
          <RemoveRow
            onClick={() =>
              update(
                { options: options.filter((_, current) => current !== index) },
                true,
              )
            }
          />
        </div>
      ))}
      <AddRow
        label="Add option"
        onClick={() =>
          update({ options: [...options, { label: "", value: "" }] }, true)
        }
      />
    </div>
  );
}

function ConditionValue({
  target,
  value,
  onChange,
}: {
  target?: FormField;
  value: string | number | boolean;
  onChange: (value: string | boolean) => void;
}) {
  return (
    <label className="block text-sm">
      Equals
      <select
        className={inputClass}
        value={String(value)}
        onChange={(event) =>
          onChange(
            target?.type === "checkbox"
              ? event.target.value === "true"
              : event.target.value,
          )
        }
      >
        {target?.type === "checkbox" ? (
          <>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </>
        ) : (
          <>
            <option value="">Choose a value</option>
            {target?.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </>
        )}
      </select>
    </label>
  );
}
