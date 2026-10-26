import { lazy } from "react";
import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
import { AppShell, NotFound, RouteError } from "./components/app-shell";
import { AdminShell } from "./components/staff-shell";
import { RequireAuth } from "./lib/auth";

const HomePage = lazy(() => import("./features/public/home-page"));
const ServicesPage = lazy(() => import("./features/public/services-page"));
const ContactPage = lazy(() => import("./features/public/contact-page"));
const InquiriesPage = lazy(
  () => import("./features/administration/inquiries-page"),
);
const AboutPage = lazy(() => import("./features/public/about-page"));
const ServiceDetailPage = lazy(
  () => import("./features/public/service-detail-page"),
);
const BlogPage = lazy(() => import("./features/public/blog-page"));
const BlogPostPage = lazy(() => import("./features/public/blog-post-page"));
const HealthPage = lazy(() => import("./features/public/health-page"));
const SignInPage = lazy(() => import("./features/auth/sign-in-page"));
const SignUpPage = lazy(() => import("./features/auth/sign-up-page"));
const ServicePagesPage = lazy(
  () => import("./features/administration/service-pages-page"),
);
const ServicePagePreviewPage = lazy(
  () => import("./features/administration/service-page-preview-page"),
);
const BlogPostsPage = lazy(
  () => import("./features/administration/blog-posts-page"),
);
const BlogPostPreviewPage = lazy(
  () => import("./features/administration/blog-post-preview-page"),
);

// Route groups: public site, auth, administration.
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
          { path: "contact", element: <ContactPage /> },
          { path: "blog", element: <BlogPage /> },
          { path: "blog/:slug", element: <BlogPostPage /> },
          { path: "sign-in/*", element: <SignInPage /> },
          { path: "sign-up/*", element: <SignUpPage /> },
          // Previews render inside the marketing chrome so the editor sees
          // exactly what visitors will see.
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
          {
            element: <AdminShell />,
            children: [
              {
                path: "admin",
                element: (
                  <RequireAuth capability="config.manage">
                    <Navigate to="/admin/service-pages" replace />
                  </RequireAuth>
                ),
              },
              {
                path: "admin/service-pages/:servicePageId?",
                element: (
                  <RequireAuth capability="config.manage">
                    <ServicePagesPage />
                  </RequireAuth>
                ),
              },
              {
                path: "admin/inquiries",
                element: (
                  <RequireAuth capability="config.manage">
                    <InquiriesPage />
                  </RequireAuth>
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
            ],
          },
          { path: "health", element: <HealthPage /> },
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
