import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import type { Section, SectionType } from "../../../convex/lib/content";
import { AddRow, RemoveRow, TextArea, TextField, inputClass } from "./field";
import { Toast, type ToastState } from "./toast";

export const sectionTypes: {
  type: SectionType;
  label: string;
  description: string;
}[] = [
  { type: "richText", label: "Text", description: "Paragraphs and headings" },
  {
    type: "numberedSteps",
    label: "Numbered steps",
    description: "A sequence with a title and body per step",
  },
  {
    type: "itemGrid",
    label: "Card grid",
    description: "Short items shown as cards",
  },
  {
    type: "calloutPanel",
    label: "Callout panel",
    description: "A highlighted note with an optional title",
  },
  { type: "image", label: "Image", description: "One image with alt text" },
  {
    type: "bulletList",
    label: "Bulleted list",
    description: "Simple list of points",
  },
];

export function sectionTypeLabel(type: SectionType) {
  return sectionTypes.find((item) => item.type === type)?.label ?? type;
}

export function sectionElementId(id: string) {
  return `section-${id}`;
}

function newSection(type: SectionType): Section {
  const id = crypto.randomUUID();
  switch (type) {
    case "richText":
      return { id, type, text: "" };
    case "numberedSteps":
      return { id, type, steps: [] };
    case "itemGrid":
    case "bulletList":
      return { id, type, items: [] };
    case "calloutPanel":
      return { id, type, body: "" };
    case "image":
      return { id, type, storageId: "", alt: "" };
  }
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export type SectionCanvasProps = {
  sections: Section[];
  onChange: (next: Section[], structural: boolean) => void;
  uploadImage?: (file: File) => Promise<string>;
};

export function SectionCanvas({
  sections,
  onChange,
  uploadImage,
}: SectionCanvasProps) {
  const [menuAt, setMenuAt] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);
  const latest = useRef(sections);
  latest.current = sections;

  function insert(index: number, type: SectionType) {
    const next = [...sections];
    next.splice(index, 0, newSection(type));
    onChange(next, true);
    setMenuAt(null);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= sections.length || from === to) return;
    onChange(moveItem(sections, from, to), true);
  }

  function remove(index: number) {
    const removed = sections[index]!;
    onChange(
      sections.filter((_, i) => i !== index),
      true,
    );
    setToast({
      message: "Section deleted",
      actionLabel: "Undo",
      onAction: () => {
        const next = [...latest.current];
        next.splice(Math.min(index, next.length), 0, removed);
        onChange(next, true);
      },
    });
  }

  function replace(index: number, section: Section, structural = false) {
    onChange(
      sections.map((current, i) => (i === index ? section : current)),
      structural,
    );
  }

  function drop(event: DragEvent, to: number) {
    event.preventDefault();
    if (dragFrom !== null) move(dragFrom, to);
    setDragFrom(null);
    setDragOver(null);
  }

  const gap = (index: number) => (
    <div className="py-1">
      <div className="flex items-center gap-2">
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        <button
          type="button"
          aria-label={`Add section at position ${index + 1}`}
          aria-expanded={menuAt === index}
          onClick={() => setMenuAt(menuAt === index ? null : index)}
          className="grid size-7 place-items-center rounded-full border bg-card text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
      {menuAt === index && (
        <ul
          role="menu"
          onKeyDown={(event) => event.key === "Escape" && setMenuAt(null)}
          ref={(node) => node?.scrollIntoView({ block: "nearest" })}
          className="mx-auto mt-2 w-64 rounded border bg-card p-1 shadow-lg"
        >
          {sectionTypes.map((item) => (
            <li key={item.type} role="none">
              <button
                type="button"
                role="menuitem"
                autoFocus={item.type === sectionTypes[0]!.type}
                onClick={() => insert(index, item.type)}
                className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-muted"
              >
                {item.label}
                <span className="block text-xs text-muted-foreground">
                  {item.description}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div>
      {sections.length === 0 && (
        <p className="text-sm text-muted-foreground">
          This page has no sections yet. Use the + below to add the first one.
        </p>
      )}
      {gap(0)}
      {sections.map((section, index) => (
        <div key={section.id}>
          <div
            id={sectionElementId(section.id)}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(index);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(event) => drop(event, index)}
            className={`rounded border bg-card ${
              dragOver === index && dragFrom !== index
                ? "border-t-2 border-t-primary"
                : ""
            } ${dragFrom === index ? "opacity-50" : ""}`}
          >
            <div className="flex items-center gap-1 border-b px-2 py-1.5">
              <span
                draggable
                onDragStart={() => setDragFrom(index)}
                onDragEnd={() => {
                  setDragFrom(null);
                  setDragOver(null);
                }}
                aria-hidden="true"
                className="cursor-grab p-1 text-muted-foreground"
              >
                <GripVertical className="size-4" />
              </span>
              <span className="flex-1 text-sm font-medium">
                {index + 1}. {sectionTypeLabel(section.type)}
              </span>
              <IconButton
                label={`Move section ${index + 1} up`}
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              >
                <ChevronUp className="size-4" />
              </IconButton>
              <IconButton
                label={`Move section ${index + 1} down`}
                disabled={index === sections.length - 1}
                onClick={() => move(index, index + 1)}
              >
                <ChevronDown className="size-4" />
              </IconButton>
              <IconButton
                label={`Delete section ${index + 1}`}
                onClick={() => remove(index)}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </div>
            <div className="space-y-3 p-3">
              <SectionFields
                section={section}
                onChange={(next, structural) =>
                  replace(index, next, structural)
                }
                uploadImage={uploadImage}
              />
            </div>
          </div>
          {gap(index + 1)}
        </div>
      ))}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}

function IconButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
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
      className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function StringRows({
  values,
  onChange,
}: {
  values: string[];
  onChange: (values: string[], structural?: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      {values.map((value, index) => (
        <div key={index} className="flex gap-2">
          <input
            aria-label={`Item ${index + 1}`}
            value={value}
            onChange={(event) =>
              onChange(
                values.map((item, i) =>
                  i === index ? event.target.value : item,
                ),
              )
            }
            className={inputClass}
          />
          <RemoveRow
            onClick={() =>
              onChange(
                values.filter((_, i) => i !== index),
                true,
              )
            }
          />
        </div>
      ))}
      <AddRow onClick={() => onChange([...values, ""], true)} />
    </div>
  );
}

function SectionFields({
  section,
  onChange,
  uploadImage,
}: {
  section: Section;
  onChange: (next: Section, structural?: boolean) => void;
  uploadImage?: (file: File) => Promise<string>;
}) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  switch (section.type) {
    case "richText":
      return (
        <TextArea
          label="Text"
          rows={8}
          value={section.text}
          onChange={(text) => onChange({ ...section, text })}
          hint="Blank line between paragraphs. Start a line with ## for a heading, > for a quote."
        />
      );
    case "numberedSteps":
      return (
        <div className="space-y-3">
          {section.steps.map((step, index) => (
            <div key={index} className="rounded border p-3">
              <TextField
                label={`Step ${index + 1} title`}
                value={step.title}
                onChange={(title) =>
                  onChange({
                    ...section,
                    steps: section.steps.map((item, i) =>
                      i === index ? { ...item, title } : item,
                    ),
                  })
                }
              />
              <TextArea
                label="Body"
                rows={3}
                value={step.body}
                onChange={(body) =>
                  onChange({
                    ...section,
                    steps: section.steps.map((item, i) =>
                      i === index ? { ...item, body } : item,
                    ),
                  })
                }
              />
              <RemoveRow
                onClick={() =>
                  onChange(
                    {
                      ...section,
                      steps: section.steps.filter((_, i) => i !== index),
                    },
                    true,
                  )
                }
              />
            </div>
          ))}
          <AddRow
            onClick={() =>
              onChange(
                {
                  ...section,
                  steps: [...section.steps, { title: "", body: "" }],
                },
                true,
              )
            }
          />
        </div>
      );
    case "itemGrid":
    case "bulletList":
      return (
        <StringRows
          values={section.items}
          onChange={(items, structural) =>
            onChange({ ...section, items }, structural)
          }
        />
      );
    case "calloutPanel":
      return (
        <>
          <TextField
            label="Title (optional)"
            value={section.title ?? ""}
            onChange={(title) =>
              onChange({ ...section, title: title || undefined })
            }
          />
          <TextArea
            label="Body"
            rows={4}
            value={section.body}
            onChange={(body) => onChange({ ...section, body })}
          />
        </>
      );
    case "image":
      return (
        <>
          {/* ponytail: no in-section preview; ticket 12. */}
          {section.storageId && (
            <p className="text-xs text-muted-foreground">Image uploaded.</p>
          )}
          <label className="block text-sm">
            {section.storageId ? "Replace image" : "Image"}
            <input
              type="file"
              accept="image/*"
              disabled={!uploadImage}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file || !uploadImage) return;
                setUploadError(null);
                uploadImage(file)
                  .then((storageId) =>
                    onChange({ ...section, storageId }, true),
                  )
                  .catch((err: unknown) =>
                    setUploadError(
                      err instanceof Error
                        ? err.message
                        : "Image upload failed",
                    ),
                  );
              }}
              className={inputClass}
            />
          </label>
          {uploadError && (
            <p role="alert" className="text-sm text-destructive">
              {uploadError}
            </p>
          )}
          <TextField
            label="Alt text"
            value={section.alt}
            onChange={(alt) => onChange({ ...section, alt })}
            hint="Describe the image for screen readers."
          />
        </>
      );
  }
}
