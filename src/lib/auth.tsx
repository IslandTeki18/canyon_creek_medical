import {
  ClerkProvider,
  RedirectToSignIn,
  UserButton,
  useAuth,
} from "@clerk/react";
import { ConvexReactClient, useConvexAuth } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { createContext, useContext, type ReactNode } from "react";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  string | undefined;
const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;

// True only when both Clerk and Convex are configured. Local unit tests and
// keyless preview builds run with this false; protected routes then render a
// configuration notice instead of protected content — never the content itself.
const AuthConfiguredContext = createContext(false);

export function useAuthConfigured(): boolean {
  return useContext(AuthConfiguredContext);
}

export function AppProviders({ children }: { children: ReactNode }) {
  if (!clerkPublishableKey || !convexUrl) {
    return children;
  }
  return <ConfiguredProviders>{children}</ConfiguredProviders>;
}

// ponytail: module-level singleton client; per-environment clients not needed.
let convexClient: ConvexReactClient | undefined;

function ConfiguredProviders({ children }: { children: ReactNode }) {
  convexClient ??= new ConvexReactClient(convexUrl!);
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey!}
      afterSignOutUrl="/sign-in"
    >
      <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
        <AuthConfiguredContext.Provider value={true}>
          {children}
        </AuthConfiguredContext.Provider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

/**
 * Client-side gate for the portal, workforce, and administration route
 * groups. Presentation only — every Convex function independently enforces
 * authentication and capability checks server-side.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const configured = useAuthConfigured();
  if (!configured) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">Sign in required</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Authentication is not configured in this environment.
        </p>
      </section>
    );
  }
  return <ClerkAuthGate>{children}</ClerkAuthGate>;
}

function ClerkAuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) {
    return (
      <p role="status" className="text-sm text-neutral-500">
        Checking your session…
      </p>
    );
  }
  if (!isSignedIn) {
    // Covers both unauthenticated visits and expired sessions.
    return <RedirectToSignIn />;
  }
  return <ConvexAuthGate>{children}</ConvexAuthGate>;
}

function ConvexAuthGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading) {
    return (
      <p role="status" className="text-sm text-neutral-500">
        Checking your session…
      </p>
    );
  }
  if (!isAuthenticated) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">Session problem</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Your session could not be verified with the server. Sign out and back
          in, or contact the practice if this persists.
        </p>
      </section>
    );
  }
  return children;
}

/** Header sign-out control; renders nothing when auth is not configured. */
export function AuthControls() {
  const configured = useAuthConfigured();
  if (!configured) return null;
  return <SignedInUserButton />;
}

function SignedInUserButton() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded || !isSignedIn) return null;
  return <UserButton />;
}
