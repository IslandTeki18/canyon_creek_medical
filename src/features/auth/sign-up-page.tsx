import { SignUp } from "@clerk/react";
import { useAuthConfigured } from "../../lib/auth";
import { AuthShell, clerkAppearance } from "./auth-shell";

// Also serves invitation acceptance: Clerk invitation links carry a ticket
// parameter that the SignUp component consumes automatically.
export default function SignUpPage() {
  const configured = useAuthConfigured();
  return (
    <AuthShell
      title="Create your account"
      subtitle="Manage appointments, forms and records in one place."
    >
      {configured ? (
        <SignUp
          routing="path"
          path="/sign-up"
          signInUrl="/sign-in"
          appearance={clerkAppearance}
        />
      ) : (
        <p className="m-0 text-center text-sm text-ink/60">
          Authentication is not configured in this environment.
        </p>
      )}
    </AuthShell>
  );
}
