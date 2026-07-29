import type { ReactNode } from "react";
import { MarketingPage } from "../public/marketing-chrome";

/** Clerk component theme matched to the Organic tokens in src/index.css. */
export const clerkAppearance = {
  variables: {
    colorPrimary: "#c67139",
    colorBackground: "#ebddc5",
    colorText: "#201e1d",
    colorInputBackground: "#f5ead8",
    borderRadius: "16px",
    fontFamily: '"Figtree", system-ui, sans-serif',
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
              className="mx-auto mb-4 h-13 w-13 rounded-full bg-clay"
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
