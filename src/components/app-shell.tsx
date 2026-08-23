import { Suspense, useEffect, useState } from "react";
import {
  Outlet,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
} from "react-router";
import { SiteNav } from "../features/public/marketing-chrome";
import { ErrorMessage, NotFound, RouteLoading } from "./route-status";

export { NotFound, RouteLoading } from "./route-status";

/**
 * Outermost layout: skip link, suspense boundary, and the page slot. Chrome
 * lives in AppChrome so full-bleed marketing pages can opt out of it.
 */
export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to main content
      </a>
      <ScrollRestoration />
      <Suspense fallback={<RouteLoading />}>
        <Outlet />
      </Suspense>
    </div>
  );
}

/** Application chrome: the site header plus the constrained main column. */
export function AppChrome() {
  return (
    <>
      <SiteNav />
      <main
        id="main-content"
        className="mx-auto w-full max-w-[1180px] flex-1 px-[clamp(20px,5vw,72px)] py-10"
      >
        <Outlet />
      </main>
    </>
  );
}

export function RouteError() {
  const error = useRouteError();
  // Safe reference id: shown to the user and logged so support can correlate
  // a report with console/server logs without any PHI leaving the error state.
  const [referenceId] = useState(() => crypto.randomUUID().slice(0, 8));
  const is404 = isRouteErrorResponse(error) && error.status === 404;

  useEffect(() => {
    if (is404) return;
    console.error(
      JSON.stringify({
        severity: "error",
        event: "client.route_error",
        referenceId,
      }),
      error,
    );
  }, [is404, referenceId, error]);

  if (is404) return <NotFound />;
  return (
    <ErrorMessage
      title="Something went wrong"
      detail={`An unexpected error occurred. Try again or return home. Reference: ${referenceId}`}
    />
  );
}
