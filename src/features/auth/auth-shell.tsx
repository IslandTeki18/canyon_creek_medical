import type { ReactNode } from "react";
import { MarketingPage } from "../public/marketing-chrome";

/** Clerk component theme matched to the blue clinical tokens in src/index.css. */
export const clerkAppearance = {
  variables: {
    colorPrimary: "#2166e8",
    colorBackground: "#ffffff",
    colorText: "#0b2545",
    // 60% ink clears WCAG AA (4.5:1) for small text on white (13.6).
    colorTextSecondary: "#5a6b82",
    colorMutedForeground: "#5a6b82",
    colorInputBackground: "#f7fafd",
    borderRadius: "16px",
    fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
  },
} as const;

/** Centered auth column: accent mark, title, subtitle, then the Clerk card. */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <MarketingPage>
      <div className="grid place-items-center px-5 pt-14 pb-24">
        <div className="w-full max-w-[440px]">
          <div className="mb-7 text-center">
            <div
              aria-hidden="true"
              className="mx-auto mb-4 h-13 w-13 rounded-full bg-primary"
            />
            <h1 className="m-0 mb-1.5 font-display text-3xl">{title}</h1>
            <p className="m-0 text-[14.5px] text-ink/70">{subtitle}</p>
          </div>
          <div className="flex justify-center">{children}</div>
        </div>
      </div>
    </MarketingPage>
  );
}
