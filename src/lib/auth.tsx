import {
  ClerkProvider,
  RedirectToSignIn,
  UserButton,
  useAuth,
} from "@clerk/react";
import {
  ConvexProvider,
  ConvexReactClient,
  useConvexAuth,
  useMutation,
  useQuery,
} from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { hasCapability, type Capability } from "../../convex/lib/permissions";

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
  if (!convexUrl) return children;
  convexClient ??= new ConvexReactClient(convexUrl);
  // Public pages query Convex without Clerk; only auth-gated routes need it.
  if (!clerkPublishableKey) {
    return <ConvexProvider client={convexClient}>{children}</ConvexProvider>;
  }
  return <ConfiguredProviders>{children}</ConfiguredProviders>;
}

// ponytail: module-level singleton client; per-environment clients not needed.
let convexClient: ConvexReactClient | undefined;

function ConfiguredProviders({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey!}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/sign-in"
    >
      <ConvexProviderWithClerk client={convexClient!} useAuth={useAuth}>
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
export function RequireAuth({
  capability,
  children,
}: {
  /** When set, the signed-in user must also hold this capability. */
  capability?: Capability;
  children: ReactNode;
}) {
  const configured = useAuthConfigured();
  if (!configured) {
    return (
      <GateNotice title="Sign in required">
        Authentication is not configured in this environment.
      </GateNotice>
    );
  }
  return <ClerkAuthGate capability={capability}>{children}</ClerkAuthGate>;
}

function ClerkAuthGate({
  capability,
  children,
}: {
  capability?: Capability;
  children: ReactNode;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Checking your session…
      </p>
    );
  }
  if (!isSignedIn) {
    // Covers both unauthenticated visits and expired sessions.
    return <RedirectToSignIn />;
  }
  return <ConvexAuthGate capability={capability}>{children}</ConvexAuthGate>;
}

function ConvexAuthGate({
  capability,
  children,
}: {
  capability?: Capability;
  children: ReactNode;
}) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Checking your session…
      </p>
    );
  }
  if (!isAuthenticated) {
    return (
      <GateNotice title="Session problem">
        Your session could not be verified with the server. Sign out and back
        in, or contact the practice if this persists.
      </GateNotice>
    );
  }
  return <UserRowGate capability={capability}>{children}</UserRowGate>;
}

/**
 * Materializes the caller's user row (covers missed/local-dev webhooks) and
 * enforces the route's capability. Presentation only — every Convex function
 * re-checks capability and ownership server-side.
 */
function UserRowGate({
  capability,
  children,
}: {
  capability?: Capability;
  children: ReactNode;
}) {
  const user = useQuery(api.domains.users.currentUser);
  const ensure = useMutation(api.domains.users.ensureCurrentUser);
  const missing = user === null;
  useEffect(() => {
    // Idempotent server-side; never resurrects deactivated users.
    if (missing) void ensure({});
  }, [missing, ensure]);
  if (user === undefined || user === null) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading your account…
      </p>
    );
  }
  if (user.status !== "active") {
    return (
      <GateNotice title="Account unavailable">
        This account is not active. Contact the practice if you believe this is
        an error.
      </GateNotice>
    );
  }
  if (capability && !hasCapability(user.roles, capability)) {
    return (
      <GateNotice title="No access">
        Your account does not have access to this area.
      </GateNotice>
    );
  }
  return children;
}

/** Gate fallback screen; renders sensibly in both marketing and app chrome. */
function GateNotice({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-[1180px] px-[clamp(20px,5vw,72px)] py-14">
      <h1 className="m-0 font-display text-3xl">{title}</h1>
      <p className="mt-2 text-sm text-ink/70">{children}</p>
    </section>
  );
}

/** Header sign-out control; renders nothing when auth is not configured. */
export function AuthControls({ showName = false }: { showName?: boolean }) {
  const configured = useAuthConfigured();
  if (!configured) return null;
  return <SignedInUserButton showName={showName} />;
}

function SignedInUserButton({ showName }: { showName: boolean }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded || !isSignedIn) return null;
  return (
    <UserButton
      showName={showName}
      appearance={
        showName
          ? { elements: { userButtonOuterIdentifier: "text-white text-sm" } }
          : undefined
      }
    />
  );
}
