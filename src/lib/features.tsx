import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { NotFound, RouteLoading } from "../components/app-shell";
import { useAuthConfigured } from "./auth";

export function useFeatureEnabled(key: string): boolean | undefined {
  const configured = useAuthConfigured();
  // Configuration is fixed for the lifetime of the app, so this hook order
  // cannot change between renders.
  /* oxlint-disable react-hooks/rules-of-hooks */
  const enabled = configured
    ? useQuery(api.domains.featureFlags.publicFlags)?.[key]
    : false;
  /* oxlint-enable react-hooks/rules-of-hooks */
  return enabled;
}

export function FeatureGate({
  flag,
  children,
}: {
  flag: string;
  children: ReactNode;
}) {
  return useFeatureEnabled(flag) ? children : null;
}

export function RequireFeature({
  flag,
  children,
  fallback = <NotFound />,
}: {
  flag: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const enabled = useFeatureEnabled(flag);
  if (enabled === undefined) return <RouteLoading />;
  return enabled ? children : fallback;
}
