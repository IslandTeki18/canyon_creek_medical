import type { ReactNode } from "react";

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
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
        {topBar}
      </div>
      <div className="grid gap-6 p-5 min-[900px]:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
        <aside className="space-y-6 self-start min-[900px]:sticky min-[900px]:top-4 min-[900px]:max-h-[calc(100vh-2rem)] min-[900px]:overflow-y-auto">
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
    <section className={`space-y-3 rounded border p-4 ${className}`}>
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}
