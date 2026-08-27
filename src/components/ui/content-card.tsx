import { Ellipsis } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

export type ContentState = "live" | "edited" | "draft" | "archived";

const states: Record<
  ContentState,
  { label: string; pill: string; mark: string }
> = {
  live: {
    label: "Live",
    pill: "bg-teal-tint text-teal",
    mark: "rounded-full bg-teal",
  },
  edited: {
    label: "Live · edited",
    pill: "bg-primary-tint text-primary-deep",
    mark: "bg-primary",
  },
  draft: {
    label: "Draft",
    pill: "border border-ink/16 bg-surface text-ink/70",
    mark: "rounded-full border-[1.5px] border-dashed border-ink/50",
  },
  archived: {
    label: "Archived",
    pill: "bg-surface-inset text-ink/60",
    mark: "rounded-full bg-ink/40",
  },
};

/** Status pill shared by content cards and editor top bars (DESIGN.md §6). */
export function StatusPill({ state }: { state: ContentState }) {
  const badge = states[state];
  return (
    <span
      className={`inline-flex flex-none items-center gap-1.75 rounded-full px-3 py-1.5 text-[11.5px] font-bold ${badge.pill}`}
    >
      <span className={`size-1.75 ${badge.mark}`} aria-hidden="true" />
      {badge.label}
    </span>
  );
}

type ContentCardProps = Pick<
  HTMLAttributes<HTMLElement>,
  "draggable" | "onDragStart" | "onDragOver" | "onDrop" | "onDragEnd"
> & {
  title: string;
  summary: string;
  chips?: readonly string[];
  /** Neutral chip after the category chips, e.g. the public path. */
  path?: string;
  media: ReactNode;
  state: ContentState;
  primaryAction?: ReactNode;
  /** Right-aligned footer text before the menu, e.g. a date. */
  meta?: ReactNode;
  menuActions: ReactNode;
  dragHandle?: boolean;
};

export function ContentCard({
  title,
  summary,
  chips = [],
  path,
  media,
  state,
  primaryAction,
  meta,
  menuActions,
  dragHandle,
  ...dragProps
}: ContentCardProps) {
  return (
    <article
      {...dragProps}
      className={`flex h-full flex-col gap-3.5 rounded-card bg-surface p-5 shadow-card transition-shadow hover:shadow-[0_12px_34px_rgba(11,37,69,.11)] ${
        state === "archived" ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {media}
        <StatusPill state={state} />
      </div>
      <div>
        <h3 className="text-lg leading-[1.3] font-bold tracking-[-0.015em]">
          {title}
        </h3>
        <p className="mt-1.5 text-[13.5px] leading-[1.6] text-ink/65">
          {summary}
        </p>
      </div>
      {(chips.length > 0 || path) && (
        <div className="flex flex-wrap gap-1.75">
          {chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full bg-primary-tint px-3 py-1.25 text-[11px] font-bold text-primary-deep"
            >
              {chip}
            </span>
          ))}
          {path && (
            <span className="rounded-full bg-surface-inset px-3 py-1.25 text-[11px] font-semibold text-ink/60">
              {path}
            </span>
          )}
        </div>
      )}
      <div className="mt-auto flex items-center gap-2 border-t border-ink/8 pt-3.5">
        {dragHandle && (
          <span
            className="cursor-grab text-muted-foreground"
            aria-hidden="true"
          >
            ⠿
          </span>
        )}
        {primaryAction}
        {meta && <span className="ml-auto text-xs text-ink/50">{meta}</span>}
        <details className={`relative ${meta ? "" : "ml-auto"}`}>
          <summary className="grid size-10 cursor-pointer list-none place-items-center rounded-full border-[1.5px] border-ink/14 text-ink/55 hover:border-primary hover:text-primary">
            <Ellipsis className="size-4" aria-hidden="true" />
            <span className="sr-only">More actions for {title}</span>
          </summary>
          <div className="absolute right-0 z-10 mt-1 flex min-w-50 flex-col gap-0.5 rounded-2xl bg-surface p-2 shadow-[0_14px_40px_rgba(11,37,69,.2)]">
            {menuActions}
          </div>
        </details>
      </div>
    </article>
  );
}

export const contentCardActionClass =
  "rounded-[10px] px-3 py-2.25 text-left text-[13.5px] font-medium hover:bg-surface-inset hover:text-primary disabled:opacity-50";

export const contentCardDangerActionClass =
  "mt-1 rounded-[10px] border-t border-ink/8 px-3 py-2.25 text-left text-[13.5px] font-medium text-warn-ink hover:bg-warn-tint disabled:opacity-50";

/** Secondary pill button used for card and top-bar actions. */
export const secondaryButtonClass =
  "inline-flex min-h-10 items-center gap-2 rounded-full border-[1.5px] border-ink/14 px-4 text-[13px] font-semibold hover:border-primary hover:text-primary disabled:opacity-50";

/** Primary pill button (blue, white text, blue shadow). */
export const primaryButtonClass =
  "inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 text-[13px] font-semibold text-white shadow-[0_6px_16px_rgba(33,102,232,.24)] hover:bg-primary-deep disabled:opacity-50";
