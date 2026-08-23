import { lazy } from "react";
import { createBrowserRouter, type RouteObject } from "react-router";
import {
  AppChrome,
  AppShell,
  NotFound,
  RouteError,
} from "./components/app-shell";

import { RequireAuth } from "./lib/auth";
import { RequireFeature } from "./lib/features";
import { MarketingPage } from "./features/public/marketing-chrome";

const HomePage = lazy(() => import("./features/public/home-page"));
const ServicesPage = lazy(() => import("./features/public/services-page"));
const AboutPage = lazy(() => import("./features/public/about-page"));
const ServiceDetailPage = lazy(
  () => import("./features/public/service-detail-page"),
);
const BookingPage = lazy(() => import("./features/public/booking-page"));
const BlogPage = lazy(() => import("./features/public/blog-page"));
const BlogPostPage = lazy(() => import("./features/public/blog-post-page"));
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
const PortalAppointmentsPage = lazy(
  () => import("./features/portal/portal-appointments-page"),
);
const PortalConsentPage = lazy(
  () => import("./features/portal/portal-consent-page"),
);
const PortalProfilePage = lazy(
  () => import("./features/portal/portal-profile-page"),
);
const PortalHealthRecordPage = lazy(
  () => import("./features/portal/portal-health-record-page"),
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
const ServiceCatalogPage = lazy(
  () => import("./features/administration/service-catalog-page"),
);
const ServicePagesPage = lazy(
  () => import("./features/administration/service-pages-page"),
);
const DashboardPage = lazy(
  () => import("./features/administration/dashboard-page"),
);
const ReportsPage = lazy(
  () => import("./features/administration/reports-page"),
);
const AuditPage = lazy(() => import("./features/administration/audit-page"));
const FeatureFlagsPage = lazy(
  () => import("./features/administration/feature-flags-page"),
);
const FormTemplatesPage = lazy(
  () => import("./features/administration/form-templates-page"),
);
const FormTemplateDetailPage = lazy(
  () => import("./features/administration/form-template-detail-page"),
);
const BlogPostsPage = lazy(
  () => import("./features/administration/blog-posts-page"),
);
const ServicePagePreviewPage = lazy(
  () => import("./features/administration/service-page-preview-page"),
);
const BlogPostPreviewPage = lazy(
  () => import("./features/administration/blog-post-preview-page"),
);
const SchedulePage = lazy(() => import("./features/scheduling/schedule-page"));
const WaitlistPage = lazy(() => import("./features/scheduling/waitlist-page"));
const AppointmentDetailPage = lazy(
  () => import("./features/scheduling/appointment-detail-page"),
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
const EncounterDetailPage = lazy(
  () => import("./features/clinical/encounter-detail-page"),
);
const ClinicalReviewQueuePage = lazy(
  () => import("./features/clinical/clinical-review-queue-page"),
);
const MatQueuePage = lazy(() => import("./features/clinical/mat-queue-page"));
const TasksPage = lazy(() => import("./features/clinical/tasks-page"));
const DocumentReviewPage = lazy(
  () => import("./features/patients/document-review-page"),
);
const PortalDocumentsPage = lazy(
  () => import("./features/portal/portal-documents-page"),
);
const KetamineSessionPage = lazy(
  () => import("./features/clinical/ketamine-session-page"),
);
const KetamineBoardPage = lazy(
  () => import("./features/clinical/ketamine-board-page"),
);
const CommunicationAdminPage = lazy(
  () => import("./features/communications/communication-admin-page"),
);
const FailureQueuePage = lazy(
  () => import("./features/communications/failure-queue-page"),
);

// Route groups: public, auth, patient portal, workforce, administration.
export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          // Marketing pages are full-bleed and carry their own navigation and
          // footer, so they sit outside the application chrome.
          { index: true, element: <HomePage /> },
          { path: "services", element: <ServicesPage /> },
          { path: "services/:slug", element: <ServiceDetailPage /> },
          { path: "about", element: <AboutPage /> },
          { path: "book", element: <BookingPage /> },
          { path: "blog", element: <BlogPage /> },
          { path: "blog/:slug", element: <BlogPostPage /> },
          {
            path: "admin/service-pages/:servicePageId/preview",
            element: (
              <RequireAuth capability="config.manage">
                <ServicePagePreviewPage />
              </RequireAuth>
            ),
          },
          {
            path: "admin/blog/:postId/preview",
            element: (
              <RequireAuth capability="content.author">
                <BlogPostPreviewPage />
              </RequireAuth>
            ),
          },
          // Auth and portal share the marketing chrome (nav + footer): they
          // are patient-facing and continue the public site's look.
          { path: "sign-in/*", element: <SignInPage /> },
          { path: "sign-up/*", element: <SignUpPage /> },
          {
            path: "portal",
            element: (
              <RequireFeature
                flag="patientPortal"
                fallback={
                  <MarketingPage>
                    <section className="mx-auto w-full max-w-[1180px] px-[clamp(20px,5vw,72px)] py-14">
                      <h1 className="font-display text-3xl">
                        Patient portal unavailable
                      </h1>
                      <p className="mt-2 text-sm text-ink/70">
                        The patient portal is not available. Call the practice.
                      </p>
                    </section>
                  </MarketingPage>
                }
              >
                <MarketingPage>
                  <RequireAuth capability="portal.access">
                    <PortalPage />
                  </RequireAuth>
                </MarketingPage>
              </RequireFeature>
            ),
            children: [
              { index: true, element: <PortalHome /> },
              { path: "profile", element: <PortalProfilePage /> },
              { path: "appointments", element: <PortalAppointmentsPage /> },
              { path: "forms", element: <PortalFormsPage /> },
              { path: "health-record", element: <PortalHealthRecordPage /> },
              {
                path: "forms/:responseId",
                element: <PortalFormFillPage />,
              },
              {
                path: "consents/:templateId",
                element: <PortalConsentPage />,
              },
              { path: "documents", element: <PortalDocumentsPage /> },
              {
                path: "settings",
                element: <PortalPlaceholder title="Account settings" />,
              },
            ],
          },
          {
            element: <AppChrome />,
            children: [
              {
                path: "app",
                element: (
                  <RequireAuth capability="patient.read">
                    <WorkforcePage />
                  </RequireAuth>
                ),
              },
              {
                path: "app/patients",
                element: (
                  <RequireAuth capability="patient.read">
                    <PatientRegistryPage />
                  </RequireAuth>
                ),
              },
              {
                path: "app/patients/new",
                element: (
                  <RequireAuth capability="patient.manage">
                    <PatientCreatePage />
                  </RequireAuth>
                ),
              },
              {
                path: "app/patients/:patientId",
                element: (
                  <RequireAuth capability="patient.read">
                    <PatientChartPage />
                  </RequireAuth>
                ),
              },
              {
                path: "app/schedule",
                element: (
                  <RequireAuth capability="appointment.manage">
                    <SchedulePage />
                  </RequireAuth>
                ),
              },
              {
                path: "app/waitlist",
                element: (
                  <RequireAuth capability="appointment.manage">
                    <WaitlistPage />
                  </RequireAuth>
                ),
              },
              {
                path: "app/appointments/:appointmentId",
                element: (
                  <RequireAuth capability="appointment.manage">
                    <AppointmentDetailPage />
                  </RequireAuth>
                ),
              },
              {
                path: "app/encounters/:encounterId",
                element: (
                  <RequireFeature flag="clinical">
                    <RequireAuth capability="encounter.read">
                      <EncounterDetailPage />
                    </RequireAuth>
                  </RequireFeature>
                ),
              },
              {
                path: "app/ketamine",
                element: (
                  <RequireFeature flag="clinical">
                    <RequireAuth capability="clinical.manage">
                      <KetamineBoardPage />
                    </RequireAuth>
                  </RequireFeature>
                ),
              },
              {
                path: "app/ketamine/sessions/:sessionId",
                element: (
                  <RequireFeature flag="clinical">
                    <RequireAuth capability="clinical.manage">
                      <KetamineSessionPage />
                    </RequireAuth>
                  </RequireFeature>
                ),
              },
              {
                path: "app/mat-queue",
                element: (
                  <RequireFeature flag="clinical">
                    <RequireAuth capability="mat.access">
                      <MatQueuePage />
                    </RequireAuth>
                  </RequireFeature>
                ),
              },
              {
                // Queue-level authorization is server-side; the route only
                // requires an authenticated workforce user.
                path: "app/tasks",
                element: (
                  <RequireFeature flag="clinical">
                    <RequireAuth capability="patient.read">
                      <TasksPage />
                    </RequireAuth>
                  </RequireFeature>
                ),
              },
              {
                path: "app/documents/review",
                element: (
                  <RequireFeature flag="clinical">
                    <RequireAuth capability="patient.manage">
                      <DocumentReviewPage />
                    </RequireAuth>
                  </RequireFeature>
                ),
              },
              {
                path: "app/clinical-review",
                element: (
                  <RequireFeature flag="clinical">
                    <RequireAuth capability="clinical.manage">
                      <ClinicalReviewQueuePage />
                    </RequireAuth>
                  </RequireFeature>
                ),
              },
              {
                path: "app/patients/:patientId/book",
                element: (
                  <RequireAuth capability="appointment.manage">
                    <BookAppointmentPage />
                  </RequireAuth>
                ),
              },
              {
                path: "admin",
                element: (
                  <RequireAuth capability="config.manage">
                    <AdminPage />
                  </RequireAuth>
                ),
              },
              {
                path: "admin/users",
                element: (
                  <RequireAuth capability="user.manage">
                    <WorkforceUsersPage />
                  </RequireAuth>
                ),
              },
              {
                path: "admin/forms",
                element: (
                  <RequireFeature flag="intakeForms">
                    <RequireAuth capability="form.manage">
                      <FormTemplatesPage />
                    </RequireAuth>
                  </RequireFeature>
                ),
              },
              {
                path: "admin/forms/:templateId",
                element: (
                  <RequireFeature flag="intakeForms">
                    <RequireAuth capability="form.manage">
                      <FormTemplateDetailPage />
                    </RequireAuth>
                  </RequireFeature>
                ),
              },
              {
                path: "admin/blog",
                element: (
                  <RequireAuth capability="content.author">
                    <BlogPostsPage />
                  </RequireAuth>
                ),
              },
              {
                path: "admin/users/:userId",
                element: (
                  <RequireAuth capability="user.manage">
                    <WorkforceUserDetailPage />
                  </RequireAuth>
                ),
              },
              {
                path: "admin/services",
                element: (
                  <RequireAuth capability="config.manage">
                    <ServiceCatalogPage />
                  </RequireAuth>
                ),
              },
              {
                path: "admin/service-pages",
                element: (
                  <RequireAuth capability="config.manage">
                    <ServicePagesPage />
                  </RequireAuth>
                ),
              },
              {
                path: "admin/dashboard",
                element: (
                  <RequireFeature flag="reporting">
                    <RequireAuth capability="report.view">
                      <DashboardPage />
                    </RequireAuth>
                  </RequireFeature>
                ),
              },
              {
                path: "admin/reports",
                element: (
                  <RequireFeature flag="reporting">
                    <RequireAuth capability="report.view">
                      <ReportsPage />
                    </RequireAuth>
                  </RequireFeature>
                ),
              },
              {
                path: "admin/audit",
                element: (
                  <RequireFeature flag="reporting">
                    <RequireAuth capability="audit.view">
                      <AuditPage />
                    </RequireAuth>
                  </RequireFeature>
                ),
              },
              {
                path: "admin/feature-flags",
                element: (
                  <RequireAuth capability="config.manage">
                    <FeatureFlagsPage />
                  </RequireAuth>
                ),
              },
              {
                path: "admin/scheduling",
                element: (
                  <RequireAuth capability="config.manage">
                    <SchedulingConfigPage />
                  </RequireAuth>
                ),
              },
              {
                path: "admin/scheduling/providers",
                element: (
                  <RequireAuth capability="config.manage">
                    <ProviderAvailabilityPage />
                  </RequireAuth>
                ),
              },
              {
                path: "admin/communications",
                element: (
                  <RequireFeature flag="communications">
                    <RequireAuth capability="communication.manage">
                      <CommunicationAdminPage />
                    </RequireAuth>
                  </RequireFeature>
                ),
              },
              {
                path: "app/communications/failures",
                element: (
                  <RequireFeature flag="communications">
                    <RequireAuth capability="communication.manage">
                      <FailureQueuePage />
                    </RequireAuth>
                  </RequireFeature>
                ),
              },
              { path: "health", element: <HealthPage /> },
              { path: "*", element: <NotFound /> },
            ],
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
