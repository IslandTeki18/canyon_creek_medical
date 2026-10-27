import { useQuery } from "convex/react";
import { Menu, X } from "lucide-react";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { api } from "../../../convex/_generated/api";
import { AuthControls, useAuthConfigured } from "../../lib/auth";
import { hasCapability } from "../../../convex/lib/permissions";

/** Placeholder contact details await real values from the practice. */
export const PRACTICE_CONTACT = {
  phone: "(555) 012-3456",
  email: "hello@canyoncreekwellness.example",
  addressLines: ["[Street address]", "[City, ST 00000]"],
} as const;

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

/** Shared navigation for public pages and auth. */
const NAV_LINK =
  "block py-2.5 font-medium no-underline hover:text-primary md:py-0";
function navLinkClass({ isActive }: { isActive: boolean }) {
  return `${NAV_LINK} ${isActive ? "text-primary" : "text-ink"}`;
}

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  // Close the mobile menu after navigating or pressing Escape.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const mobileOnly = open ? "flex" : "hidden md:flex";
  return (
    <header className="sticky top-0 z-50 border-b border-ink/7 bg-ground/88 font-body text-ink backdrop-blur-[10px]">
      <nav
        aria-label="Primary"
        className={`${WRAP} flex flex-wrap items-center gap-x-7 gap-y-3 py-4`}
      >
        <Link
          to="/"
          className="mr-auto flex items-center gap-2.5 text-base font-extrabold tracking-[-0.02em] text-ink no-underline md:text-[19px]"
        >
          <img
            src="/brand/logo-mark.png"
            alt=""
            className="block h-8 w-auto md:h-9"
          />
          Canyon Creek
        </Link>
        {import.meta.env.MODE !== "production" && (
          <span className="rounded-full bg-teal-tint px-2 py-0.5 text-xs font-semibold text-teal">
            {import.meta.env.MODE}
          </span>
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
          className="-mr-2 rounded-lg p-2 text-ink hover:bg-ink/5 md:hidden"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
        <div
          id="site-menu"
          className={`${mobileOnly} order-last w-full flex-col items-stretch gap-1 border-t border-ink/7 pt-3 text-base md:order-none md:w-auto md:flex-row md:items-center md:gap-7 md:border-0 md:pt-0 md:text-[14.5px]`}
        >
          <NavLink to="/services" className={navLinkClass}>
            Services
          </NavLink>
          <NavLink to="/about" className={navLinkClass}>
            About
          </NavLink>
          <NavLink to="/blog" className={navLinkClass}>
            Blog
          </NavLink>
          <NavLink to="/contact" className={navLinkClass}>
            Contact
          </NavLink>
          <AdminLink />
          <div className="mt-3 flex flex-wrap items-center gap-3 md:hidden">
            <Link to="/contact" className={CTA_PRIMARY}>
              Get in touch
            </Link>
            <AuthControls />
          </div>
        </div>
        <div className="hidden items-center gap-7 md:flex">
          <Link
            to="/contact"
            className="rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white no-underline shadow-[0_6px_18px_rgba(33,102,232,.28)] hover:bg-primary-deep hover:text-white"
          >
            Get in touch
          </Link>
          <AuthControls />
        </div>
      </nav>
    </header>
  );
}

/**
 * Shown only to a signed-in administrator. Presentation only; routes and
 * Convex functions enforce access.
 */
function AdminLink() {
  return useAuthConfigured() ? <SignedInAdminLink /> : null;
}

function SignedInAdminLink() {
  const user = useQuery(api.domains.users.currentUser);
  if (!user || !hasCapability(user.roles, "config.manage")) return null;
  return (
    <NavLink to="/admin" className={navLinkClass}>
      Admin
    </NavLink>
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
          <img
            src="/brand/logo-lockup-white.png"
            alt="Canyon Creek Health and Wellness"
            className="mb-4 block h-auto w-[180px]"
          />
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
        </div>
        <div className="flex flex-col gap-2.5 text-[13.5px]">
          <span className="mb-1 font-bold">Contact</span>
          <a
            href={`tel:${PRACTICE_CONTACT.phone.replace(/[^+\d]/g, "")}`}
            className={FOOTER_LINK}
          >
            {PRACTICE_CONTACT.phone}
          </a>
          <a
            href={`mailto:${PRACTICE_CONTACT.email}`}
            className={`${FOOTER_LINK} break-words`}
          >
            {PRACTICE_CONTACT.email}
          </a>
          {PRACTICE_CONTACT.addressLines.map((line) => (
            <span key={line} className="text-white/62">
              {line}
            </span>
          ))}
          <Link to="/contact" className={FOOTER_LINK}>
            Contact page
          </Link>
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
