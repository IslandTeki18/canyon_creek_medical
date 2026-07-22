import { lazy } from "react";
import { createBrowserRouter, type RouteObject } from "react-router";
import { AppShell, NotFound, RouteError } from "./components/app-shell";

const HomePage = lazy(() => import("./features/public/home-page"));
const SignInPage = lazy(() => import("./features/auth/sign-in-page"));
const PortalPage = lazy(() => import("./features/portal/portal-page"));
const WorkforcePage = lazy(() => import("./features/workforce/workforce-page"));
const AdminPage = lazy(() => import("./features/administration/admin-page"));

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
          { path: "sign-in", element: <SignInPage /> },
          { path: "portal", element: <PortalPage /> },
          { path: "app", element: <WorkforcePage /> },
          { path: "admin", element: <AdminPage /> },
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
