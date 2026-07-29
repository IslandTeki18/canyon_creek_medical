import { SignIn } from "@clerk/react";
import { useAuthConfigured } from "../../lib/auth";
import { AuthShell, clerkAppearance } from "./auth-shell";

export default function SignInPage() {
  const configured = useAuthConfigured();
  return (
    <AuthShell
      title="Sign in"
      subtitle="Access appointments, forms and records."
    >
      {configured ? (
        <SignIn
          routing="path"
          path="/sign-in"
          signUpUrl="/sign-up"
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
