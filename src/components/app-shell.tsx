import { Suspense } from "react";
import {
  Link,
  Outlet,
  isRouteErrorResponse,
  useRouteError,
} from "react-router";

const NAV_LINKS: ReadonlyArray<{ to: string; label: string }> = [
  { to: "/", label: "Home" },
  { to: "/sign-in", label: "Sign in" },
  { to: "/portal", label: "Patient portal" },
  { to: "/app", label: "Workforce" },
  { to: "/admin", label: "Administration" },
];

export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to main content
      </a>
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <Link to="/" className="font-semibold">
            Canyon Creek
          </Link>
          {import.meta.env.MODE !== "production" && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              {import.meta.env.MODE}
            </span>
          )}
          <nav aria-label="Primary" className="ml-auto flex gap-4 text-sm">
            {NAV_LINKS.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className="text-neutral-600 hover:text-neutral-900"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main
        id="main-content"
        className="mx-auto w-full max-w-5xl flex-1 px-4 py-8"
      >
        <Suspense fallback={<RouteLoading />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}

export function RouteLoading() {
  return (
    <p role="status" className="text-sm text-neutral-500">
      Loading…
    </p>
  );
}

function ErrorMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="py-8 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-neutral-500">{detail}</p>
      <Link to="/" className="mt-4 inline-block text-sm underline">
        Return home
      </Link>
    </div>
  );
}

export function NotFound() {
  return (
    <ErrorMessage
      title="Page not found"
      detail="The page you requested does not exist."
    />
  );
}

export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;
  return (
    <ErrorMessage
      title="Something went wrong"
      detail="An unexpected error occurred. Try again or return home."
    />
  );
}
