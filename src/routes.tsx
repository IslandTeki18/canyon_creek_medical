import { lazy } from "react";
import { createBrowserRouter, type RouteObject } from "react-router";
import { AppShell, NotFound, RouteError } from "./components/app-shell";

import { RequireAuth } from "./lib/auth";

const HomePage = lazy(() => import("./features/public/home-page"));
const SignInPage = lazy(() => import("./features/auth/sign-in-page"));
const SignUpPage = lazy(() => import("./features/auth/sign-up-page"));
const PortalPage = lazy(() => import("./features/portal/portal-page"));
const PortalHome = lazy(() =>
  import("./features/portal/portal-page").then((m) => ({
    default: m.PortalHome,
  })),
);
const PortalProfilePage = lazy(
  () => import("./features/portal/portal-profile-page"),
);
const PortalPlaceholder = lazy(() =>
  import("./features/portal/portal-page").then((m) => ({
    default: m.PortalPlaceholder,
  })),
);
const WorkforcePage = lazy(() => import("./features/workforce/workforce-page"));
const AdminPage = lazy(() => import("./features/administration/admin-page"));
const PatientRegistryPage = lazy(
  () => import("./features/patients/patient-registry-page"),
);
const PatientCreatePage = lazy(
  () => import("./features/patients/patient-create-page"),
);
const PatientChartPage = lazy(
  () => import("./features/patients/patient-chart-page"),
);
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
            children: [
              { index: true, element: <PortalHome /> },
              { path: "profile", element: <PortalProfilePage /> },
              {
                path: "appointments",
                element: <PortalPlaceholder title="Appointments" />,
              },
              { path: "forms", element: <PortalPlaceholder title="Forms" /> },
              {
                path: "documents",
                element: <PortalPlaceholder title="Documents" />,
              },
              {
                path: "settings",
                element: <PortalPlaceholder title="Account settings" />,
              },
            ],
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
            path: "app/patients",
            element: (
              <RequireAuth>
                <PatientRegistryPage />
              </RequireAuth>
            ),
          },
          {
            path: "app/patients/new",
            element: (
              <RequireAuth>
                <PatientCreatePage />
              </RequireAuth>
            ),
          },
          {
            path: "app/patients/:patientId",
            element: (
              <RequireAuth>
                <PatientChartPage />
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
