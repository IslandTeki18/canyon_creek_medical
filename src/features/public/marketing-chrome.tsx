import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router";
import { AuthControls } from "../../lib/auth";

/** Shared page gutter for every marketing section (Organic: 1180px, fluid gutter). */
export const WRAP = "mx-auto w-full max-w-[1180px] px-[clamp(20px,5vw,72px)]";

/** Section eyebrow above a heading. */
export const KICKER =
  "block text-[13px] font-semibold tracking-[0.06em] text-clay-700 uppercase";

export const CTA_PRIMARY =
  "rounded-full bg-clay px-5.5 py-3 font-display text-sm text-sand no-underline hover:bg-clay-600";
export const CTA_SECONDARY =
  "rounded-full border border-ink/15 px-5.5 py-3 font-display text-sm text-ink no-underline hover:bg-ink/7";

export type IconType = ComponentType<{ size?: number; strokeWidth?: number }>;

/** Organic uses Lucide at stroke-width 2.75 for a rounder, heavier look. */
export function Icon({ as: As, size = 22 }: { as: IconType; size?: number }) {
  return <As size={size} strokeWidth={2.75} />;
}

/** Full-bleed public page: site header, page body, site footer. */
export function MarketingPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 scroll-smooth flex-col overflow-x-clip bg-sand font-body text-ink">
      <SiteNav />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

/** Soft circular accent bleeding off the top-right of a page header. */
export function HeaderBlob({ size }: { size: number }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-0 rounded-full bg-sage-200"
      style={{
        width: size,
        height: size,
        right: -size * 0.36,
        top: -size * 0.45,
      }}
    />
  );
}

/**
 * Site navigation — used by the landing page and by the application chrome, so
 * there is one header across the whole product. The section links are
 * document-relative anchors into the landing page: same-document scroll when
 * already there, a normal navigation from anywhere else. Public
 * self-scheduling is deferred, so "Book an appointment" sends visitors into
 * the portal (which gates on sign-in).
 */
const NAV_ANCHORS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/#approach", label: "Our Approach" },
  { href: "/#how-it-works", label: "How it Works" },
];

const NAV_LINK = "text-sm text-ink no-underline hover:text-clay";

export function SiteNav() {
  return (
    <header className="bg-sand font-body text-ink">
      {/* relative/z-10 keeps the bar above the hero's decorative circle. */}
      <nav
        aria-label="Primary"
        className={`${WRAP} relative z-10 flex items-center gap-7 py-5`}
      >
        <Link to="/" className="mr-auto font-display text-lg text-ink">
          Canyon Creek
        </Link>
        {import.meta.env.MODE !== "production" && (
          <span className="rounded-full bg-sage-100 px-2 py-0.5 text-xs font-semibold text-sage-700">
            {import.meta.env.MODE}
          </span>
        )}
        <div className="hidden items-center gap-6 md:flex">
          <Link to="/services" className={NAV_LINK}>
            Services
          </Link>
          <Link to="/about" className={NAV_LINK}>
            About
          </Link>
          {NAV_ANCHORS.map(({ href, label }) => (
            <a key={href} href={href} className={NAV_LINK}>
              {label}
            </a>
          ))}
          <Link to="/portal" className={NAV_LINK}>
            Patient Portal
          </Link>
        </div>
        <Link
          to="/portal/appointments"
          className="rounded-full bg-clay px-4 py-2 font-display text-sm text-sand no-underline hover:bg-clay-600"
        >
          Book an appointment
        </Link>
        <AuthControls />
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-ink/15">
      <div
        className={`${WRAP} grid grid-cols-2 gap-8 pt-11 md:grid-cols-[2fr_1fr_1fr]`}
      >
        <div>
          <div className="mb-3 font-display text-lg">Canyon Creek</div>
          <p className="m-0 max-w-[40ch] text-[13.5px] leading-relaxed text-ink/70">
            Bridging traditional medicine with innovative, evidence-based
            therapies for the whole person.
          </p>
        </div>
        <div className="flex flex-col gap-2 text-[13.5px]">
          <span className="mb-1 font-semibold">Care</span>
          <Link
            to="/services"
            className="text-ink/70 no-underline hover:text-clay"
          >
            Services
          </Link>
          <Link
            to="/portal/appointments"
            className="text-ink/70 no-underline hover:text-clay"
          >
            Book
          </Link>
          <Link
            to="/portal"
            className="text-ink/70 no-underline hover:text-clay"
          >
            Patient portal
          </Link>
        </div>
        <div className="flex flex-col gap-2 text-[13.5px]">
          <span className="mb-1 font-semibold">Contact</span>
          <span className="text-ink/70">(555) 012-3456</span>
          <span className="text-ink/70">hello@canyoncreekwellness.example</span>
        </div>
      </div>
      <div className={`${WRAP} pt-9 pb-8 text-[12.5px] text-ink/55`}>
        © 2026 Canyon Creek Health and Wellness. This site is for informational
        purposes and is not a substitute for medical advice.
      </div>
    </footer>
  );
}
