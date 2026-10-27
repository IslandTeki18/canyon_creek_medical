import { Globe, Inbox, Newspaper, PanelsTopLeft } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router";
import type { IconType } from "../features/public/marketing-chrome";
import { AuthControls } from "../lib/auth";

/**
 * Administration chrome: a persistent navy sidebar plus the work surface
 * (DESIGN.md §6 "App sidebar"). Links are presentation only — routes and
 * Convex functions enforce access.
 */
export function AdminShell() {
  return (
    <div className="flex min-h-screen bg-ground font-body text-ink">
      <nav
        aria-label="Administration"
        className="sticky top-0 flex h-screen w-[264px] flex-none flex-col gap-6.5 bg-ink px-4 py-6 text-white"
      >
        <NavLink
          to="/"
          className="flex items-center gap-2.5 px-2.5 text-[17px] font-extrabold tracking-[-0.02em] text-white no-underline"
        >
          <img
            src="/brand/logo-mark-white.png"
            alt=""
            className="block h-7 w-auto"
          />
          Canyon Creek
        </NavLink>
        <div className="flex flex-col gap-0.75">
          <span className="px-2.5 pb-2 text-[10.5px] font-bold tracking-[0.09em] text-white/42 uppercase">
            Content
          </span>
          <Item to="/admin/service-pages" icon={PanelsTopLeft}>
            Service pages
          </Item>
          <Item to="/admin/blog" icon={Newspaper}>
            Blog posts
          </Item>
        </div>
        <div className="flex flex-col gap-0.75">
          <span className="px-2.5 pb-2 text-[10.5px] font-bold tracking-[0.09em] text-white/42 uppercase">
            Inbox
          </span>
          <Item to="/admin/inquiries" icon={Inbox}>
            Inquiries
          </Item>
        </div>
        <div className="mt-auto flex flex-col gap-0.75">
          <Item to="/" icon={Globe} muted>
            Back to website
          </Item>
          <div className="mt-3 flex items-center gap-3 border-t border-white/12 px-3 pt-4 empty:hidden">
            <AuthControls showName />
          </div>
        </div>
      </nav>
      <main
        id="main-content"
        className="min-w-0 flex-1 px-[clamp(20px,3vw,40px)] py-8"
      >
        <Outlet />
      </main>
    </div>
  );
}

function Item({
  to,
  icon: As,
  muted,
  children,
}: {
  to: string;
  icon: IconType;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex min-h-11 items-center gap-2.75 rounded-xl px-3 py-2.75 text-sm no-underline ${
          isActive
            ? "bg-primary font-semibold text-white"
            : `font-medium hover:bg-white/8 hover:text-white ${muted ? "text-white/62" : "text-white/72"}`
        }`
      }
    >
      <As size={18} strokeWidth={2} />
      {children}
    </NavLink>
  );
}
