import { SignUp } from "@clerk/react";
import { useAuthConfigured } from "../../lib/auth";

// Also serves invitation acceptance: Clerk invitation links carry a ticket
// parameter that the SignUp component consumes automatically.
export default function SignUpPage() {
  const configured = useAuthConfigured();
  return (
    <section>
      <h1 className="text-2xl font-semibold">Create your account</h1>
      {configured ? (
        <div className="mt-4">
          <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
        </div>
      ) : (
        <p className="mt-2 text-sm text-neutral-500">
          Authentication is not configured in this environment.
        </p>
      )}
    </section>
  );
}
