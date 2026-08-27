import type { ReactNode } from "react";

/** Editor chrome: grouped top bar, sticky rail, section canvas (DESIGN.md §6). */
export function EditorShell({
  topBar,
  rail,
  children,
}: {
  topBar: ReactNode;
  rail: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-card bg-ground shadow-[0_16px_50px_rgba(11,37,69,.14)]">
      <div className="flex flex-wrap items-center gap-3.5 border-b border-ink/10 bg-surface px-6 py-3.5">
        {topBar}
      </div>
      <div className="grid gap-6 p-6 min-[900px]:grid-cols-[minmax(18rem,22.5rem)_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4 self-start min-[900px]:sticky min-[900px]:top-4 min-[900px]:max-h-[calc(100vh-2rem)] min-[900px]:overflow-y-auto">
          {rail}
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

export function RailGroup({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex flex-col gap-4 rounded-[20px] bg-surface p-5 shadow-card ${className}`}
    >
      <h3 className={railLabelClass}>{title}</h3>
      {children}
    </section>
  );
}

export const railLabelClass =
  "m-0 text-[11px] font-bold tracking-[0.09em] text-primary uppercase";

/** Vertical divider between top-bar groups. */
export function TopBarDivider() {
  return <span aria-hidden="true" className="h-6.5 w-px bg-ink/12" />;
}
