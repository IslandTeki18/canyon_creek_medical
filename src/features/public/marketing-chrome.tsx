import { useQuery } from "convex/react";
import type { ComponentType, ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { api } from "../../../convex/_generated/api";
import { AuthControls, useAuthConfigured } from "../../lib/auth";
import { FeatureGate } from "../../lib/features";

/** Shared page gutter for every marketing section (DESIGN.md: 1220px, fluid gutter). */
export const WRAP = "mx-auto w-full max-w-[1220px] px-[clamp(20px,5vw,64px)]";

/** Section eyebrow above a heading. */
export const KICKER =
  "block text-[12.5px] font-bold tracking-[0.08em] text-primary uppercase";

export const CTA_PRIMARY =
  "rounded-full bg-primary px-6 py-3.5 text-[14.5px] font-semibold text-white no-underline shadow-action hover:bg-primary-deep hover:text-white";
export const CTA_SECONDARY =
  "rounded-full border-[1.5px] border-ink/15 px-6 py-3.5 text-[14.5px] font-semibold text-ink no-underline hover:border-primary hover:text-primary";

/** Solid-blue panel used for closing calls to action. */
export const BLUE_PANEL =
  "rounded-hero bg-primary p-[clamp(32px,4.5vw,56px)] text-white shadow-blue-panel";

export type IconType = ComponentType<{ size?: number; strokeWidth?: number }>;

export function Icon({ as: As, size = 22 }: { as: IconType; size?: number }) {
  return <As size={size} strokeWidth={2} />;
}

const TILE_TONES = {
  primary: "bg-primary-tint text-primary",
  teal: "bg-teal-tint text-teal",
  inverse: "bg-white/20 text-white",
  surface: "bg-surface text-teal",
} as const;

/** Icons never sit bare on a surface: a rounded tint tile carries them. */
export function IconTile({
  as,
  tone = "primary",
  size = 44,
}: {
  as: IconType;
  tone?: keyof typeof TILE_TONES;
  size?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className={`grid flex-none place-items-center rounded-[14px] ${TILE_TONES[tone]}`}
      style={{ width: size, height: size }}
    >
      <Icon as={as} size={Math.round(size * 0.52)} />
    </span>
  );
}

/** Labeled stripe placeholder for an image slot — never a gray box. */
export function Placeholder({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`grid place-items-center bg-placeholder ${className}`}
    >
      <span className="rounded-full bg-surface px-3.5 py-2 font-mono text-[11.5px] tracking-[0.04em] text-ink/55">
        {label}
      </span>
    </div>
  );
}

/** Full-bleed public page: site header, page body, site footer. */
export function MarketingPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 scroll-smooth flex-col overflow-x-clip bg-ground font-body text-ink">
      <SiteNav />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

/**
 * Site navigation — one header across the public site, auth, and portal.
 * Public self-scheduling is deferred, so "Book an appointment" leads to the
 * booking request wizard — a request form staff confirm manually.
 */
const NAV_LINK = "text-[14.5px] font-medium no-underline hover:text-primary";
function navLinkClass({ isActive }: { isActive: boolean }) {
  return `${NAV_LINK} ${isActive ? "text-primary" : "text-ink"}`;
}

export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-ink/7 bg-ground/88 font-body text-ink backdrop-blur-[10px]">
      <nav
        aria-label="Primary"
        className={`${WRAP} flex flex-wrap items-center gap-x-7 gap-y-3 py-4`}
      >
        <Link
          to="/"
          className="mr-auto text-[19px] font-extrabold tracking-[-0.02em] text-ink no-underline"
        >
          Canyon Creek
        </Link>
        {import.meta.env.MODE !== "production" && (
          <span className="rounded-full bg-teal-tint px-2 py-0.5 text-xs font-semibold text-teal">
            {import.meta.env.MODE}
          </span>
        )}
        {/* ponytail: links wrap to a second row on mobile; add a drawer if the row overflows */}
        <div className="order-last flex w-full flex-wrap items-center gap-x-5 gap-y-2 md:order-none md:w-auto md:gap-7">
          <NavLink to="/services" className={navLinkClass}>
            Services
          </NavLink>
          <NavLink to="/about" className={navLinkClass}>
            About
          </NavLink>
          <NavLink to="/blog" className={navLinkClass}>
            Blog
          </NavLink>
          <AccountLinks />
        </div>
        <Link
          to="/book"
          className="rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white no-underline shadow-[0_6px_18px_rgba(33,102,232,.28)] hover:bg-primary-deep hover:text-white"
        >
          Book an appointment
        </Link>
        <AuthControls />
      </nav>
    </header>
  );
}

/**
 * Account-area nav links, split by audience: workforce users get Staff (and
 * Admin when they can manage the practice); everyone else — visitors and
 * patients — gets Patient Portal. Presentation only; routes and Convex
 * functions enforce access.
 */
function AccountLinks() {
  const configured = useAuthConfigured();
  if (!configured) {
    return (
      <NavLink to="/portal" className={navLinkClass}>
        Patient Portal
      </NavLink>
    );
  }
  return <SignedInAccountLinks />;
}

function SignedInAccountLinks() {
  const user = useQuery(api.domains.users.currentUser);
  if (user?.type === "workforce") {
    return (
      <NavLink to="/app" className={navLinkClass}>
        Dashboard
      </NavLink>
    );
  }
  return (
    <FeatureGate flag="patientPortal">
      <NavLink to="/portal" className={navLinkClass}>
        Patient Portal
      </NavLink>
    </FeatureGate>
  );
}

const FOOTER_LINK = "text-white/62 no-underline hover:text-white";

export function SiteFooter() {
  return (
    <footer className="bg-ink text-white">
      <div
        className={`${WRAP} grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-9 pt-14`}
      >
        <div>
          <div className="mb-3.5 text-lg font-extrabold tracking-[-0.02em]">
            Canyon Creek
          </div>
          <p className="m-0 max-w-[42ch] text-[13.5px] leading-[1.7] text-white/62">
            Bridging traditional medicine with innovative, evidence-based
            therapies for the whole person.
          </p>
        </div>
        <div className="flex flex-col gap-2.5 text-[13.5px]">
          <span className="mb-1 font-bold">Care</span>
          <Link to="/services" className={FOOTER_LINK}>
            Services
          </Link>
          <Link to="/book" className={FOOTER_LINK}>
            Book
          </Link>
          <PortalFooterLink />
        </div>
        <div className="flex flex-col gap-2.5 text-[13.5px]">
          <span className="mb-1 font-bold">Contact</span>
          <span className="text-white/62">(555) 012-3456</span>
          <span className="text-white/62">
            hello@canyoncreekwellness.example
          </span>
        </div>
      </div>
      <div
        className={`${WRAP} pt-10 pb-9 text-[12.5px] leading-[1.6] text-white/50`}
      >
        © 2026 Canyon Creek Health and Wellness. This site is for informational
        purposes and is not a substitute for medical advice.
      </div>
    </footer>
  );
}

function PortalFooterLink() {
  const link = (
    <Link to="/portal" className={FOOTER_LINK}>
      Patient portal
    </Link>
  );
  return useAuthConfigured() ? (
    <FeatureGate flag="patientPortal">{link}</FeatureGate>
  ) : (
    link
  );
}
