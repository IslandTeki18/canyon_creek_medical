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
const PortalFormsPage = lazy(
  () => import("./features/portal/portal-forms-page"),
);
const PortalFormFillPage = lazy(() =>
  import("./features/portal/portal-forms-page").then((m) => ({
    default: m.PortalFormFillPage,
  })),
);
const PortalConsentPage = lazy(
  () => import("./features/portal/portal-consent-page"),
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
const FormTemplatesPage = lazy(
  () => import("./features/administration/form-templates-page"),
);
const FormTemplateDetailPage = lazy(
  () => import("./features/administration/form-template-detail-page"),
);
const BookAppointmentPage = lazy(
  () => import("./features/scheduling/book-appointment-page"),
);
const SchedulingConfigPage = lazy(
  () => import("./features/scheduling/scheduling-config-page"),
);
const ProviderAvailabilityPage = lazy(
  () => import("./features/scheduling/provider-availability-page"),
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
              { path: "forms", element: <PortalFormsPage /> },
              { path: "forms/:responseId", element: <PortalFormFillPage /> },
              {
                path: "consents/:templateId",
                element: <PortalConsentPage />,
              },
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
            path: "app/patients/:patientId/book",
            element: (
              <RequireAuth>
                <BookAppointmentPage />
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
            path: "admin/forms",
            element: (
              <RequireAuth>
                <FormTemplatesPage />
              </RequireAuth>
            ),
          },
          {
            path: "admin/forms/:templateId",
            element: (
              <RequireAuth>
                <FormTemplateDetailPage />
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
          {
            path: "admin/scheduling",
            element: (
              <RequireAuth>
                <SchedulingConfigPage />
              </RequireAuth>
            ),
          },
          {
            path: "admin/scheduling/providers",
            element: (
              <RequireAuth>
                <ProviderAvailabilityPage />
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
