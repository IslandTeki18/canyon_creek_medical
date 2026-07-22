import { lazy } from "react";
import { createBrowserRouter, type RouteObject } from "react-router";
import { AppShell, NotFound, RouteError } from "./components/app-shell";

import { RequireAuth } from "./lib/auth";

const HomePage = lazy(() => import("./features/public/home-page"));
const SignInPage = lazy(() => import("./features/auth/sign-in-page"));
const SignUpPage = lazy(() => import("./features/auth/sign-up-page"));
const PortalPage = lazy(() => import("./features/portal/portal-page"));
const WorkforcePage = lazy(() => import("./features/workforce/workforce-page"));
const AdminPage = lazy(() => import("./features/administration/admin-page"));
const WorkforceUsersPage = lazy(
  () => import("./features/administration/workforce-users-page"),
);
const WorkforceUserDetailPage = lazy(
  () => import("./features/administration/workforce-user-detail-page"),
);
const HealthPage = lazy(() => import("./features/public/health-page"));

// Route groups: public, auth, patient portal, workforce, administration.
export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, element: <HomePage /> },
          { path: "sign-in/*", element: <SignInPage /> },
          { path: "sign-up/*", element: <SignUpPage /> },
          {
            path: "portal",
            element: (
              <RequireAuth>
                <PortalPage />
              </RequireAuth>
            ),
          },
          {
            path: "app",
            element: (
              <RequireAuth>
                <WorkforcePage />
              </RequireAuth>
            ),
          },
          {
            path: "admin",
            element: (
              <RequireAuth>
                <AdminPage />
              </RequireAuth>
            ),
          },
          {
            path: "admin/users",
            element: (
              <RequireAuth>
                <WorkforceUsersPage />
              </RequireAuth>
            ),
          },
          {
            path: "admin/users/:userId",
            element: (
              <RequireAuth>
                <WorkforceUserDetailPage />
              </RequireAuth>
            ),
          },
          { path: "health", element: <HealthPage /> },
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
