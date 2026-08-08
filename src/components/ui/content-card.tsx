import type { HTMLAttributes, ReactNode } from "react";

type ContentState = "live" | "edited" | "draft" | "archived";

const states: Record<ContentState, { label: string; mark: string }> = {
  live: { label: "Live", mark: "rounded-full bg-sage-600" },
  edited: { label: "Live · edited", mark: "bg-clay" },
  draft: { label: "Draft", mark: "rounded-full border border-dashed" },
  archived: { label: "Archived", mark: "rounded-full bg-muted-foreground" },
};

type ContentCardProps = Pick<
  HTMLAttributes<HTMLElement>,
  "draggable" | "onDragStart" | "onDragOver" | "onDrop" | "onDragEnd"
> & {
  title: string;
  summary: string;
  chips?: readonly string[];
  media: ReactNode;
  state: ContentState;
  primaryAction?: ReactNode;
  menuActions: ReactNode;
  dragHandle?: boolean;
};

export function ContentCard({
  title,
  summary,
  chips = [],
  media,
  state,
  primaryAction,
  menuActions,
  dragHandle,
  ...dragProps
}: ContentCardProps) {
  const badge = states[state];
  return (
    <article
      {...dragProps}
      className={`flex h-full flex-col gap-3 rounded-organic border bg-card p-5 shadow-organic-sm ${
        state === "archived" ? "border-dashed opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {media}
        <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
          <span className={`size-2 ${badge.mark}`} aria-hidden="true" />
          {badge.label}
        </span>
      </div>
      <div>
        <h3 className="font-display text-xl">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{summary}</p>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full bg-sage-100 px-2.5 py-0.5 text-xs text-sage-800"
            >
              {chip}
            </span>
          ))}
        </div>
      )}
      <div className="mt-auto flex items-center gap-2 border-t pt-3">
        {dragHandle && (
          <span className="cursor-grab text-muted-foreground" aria-hidden="true">
            ⠿
          </span>
        )}
        {primaryAction}
        <details className="relative ml-auto">
          <summary className="cursor-pointer list-none rounded-full border px-3 py-1 text-sm">
            <span aria-hidden="true">•••</span>
            <span className="sr-only">More actions for {title}</span>
          </summary>
          <div
            className="absolute right-0 z-10 mt-1 flex min-w-44 flex-col gap-1 rounded border bg-card p-2 shadow-lg"
          >
            {menuActions}
          </div>
        </details>
      </div>
    </article>
  );
}

export const contentCardActionClass =
  "rounded px-2 py-1 text-left text-sm hover:bg-muted disabled:opacity-50";
