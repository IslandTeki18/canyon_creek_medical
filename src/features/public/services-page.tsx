import { useQuery } from "convex/react";
import { Link } from "react-router";
import {
  Brain,
  Circle,
  Droplet,
  Leaf,
  Pill,
  Shield,
  Sparkles,
  Wind,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { ServicePageContent } from "../../../convex/lib/content";
import {
  CTA_PRIMARY,
  Icon,
  KICKER,
  MarketingPage,
  WRAP,
  type IconType,
} from "./marketing-chrome";

const ICONS: Record<string, IconType> = {
  brain: Brain,
  leaf: Leaf,
  pill: Pill,
  shield: Shield,
  sparkles: Sparkles,
};

// Unapproved modules — listed as future intent only. Each stays behind a
// server-owned feature flag before any of it becomes bookable.
const FUTURE: ReadonlyArray<{ icon: IconType; title: string; body: string }> = [
  {
    icon: Droplet,
    title: "Spravato® (Esketamine)",
    body: "An FDA-approved intranasal treatment for treatment-resistant depression, administered under physician supervision in a REMS-certified office.",
  },
  {
    icon: Sparkles,
    title: "Peptide Therapy",
    body: "Medically supervised peptide therapy for metabolic health, recovery, hormonal optimization and healthy aging.",
  },
  {
    icon: Wind,
    title: "Hyperbaric Oxygen Therapy",
    body: "Concentrated oxygen in a pressurized chamber to support tissue healing, circulation and recovery.",
  },
];

export default function ServicesPage() {
  const pages = useQuery(api.domains.content.listPublishedServicePages, {});

  return (
    <MarketingPage>
      <header className="relative">
        <div className={`${WRAP} relative z-10 pt-14 pb-10`}>
          <span className={`${KICKER} mb-4`}>Our services</span>
          <h1 className="m-0 max-w-[18ch] font-display text-[clamp(38px,5vw,64px)] leading-[1.05] tracking-[-0.01em]">
            Comprehensive care, all in one practice
          </h1>
          <p className="mt-5.5 mb-0 max-w-[58ch] text-[17px] leading-[1.65] text-ink/80">
            From psychiatry and medication management to addiction medicine and
            advanced depression treatments — every plan is built around the
            whole person.
          </p>
        </div>
      </header>

      <section className={`${WRAP} pt-6 pb-12`}>
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5.5 p-0">
          {pages === undefined
            ? [0, 1, 2].map((item) => (
                <li
                  key={item}
                  role="status"
                  aria-label="Loading service"
                  className="h-72 animate-pulse rounded-card bg-surface"
                />
              ))
            : pages.map((page) => {
                const service = page.content as ServicePageContent;
                return (
                  <li
                    key={page.slug}
                    className="flex flex-col gap-3.5 rounded-card bg-surface p-7 shadow-card"
                  >
                    <div className="grid size-12.5 place-items-center rounded-full bg-primary-tint text-primary-deep">
                      <Icon as={ICONS[service.icon] ?? Circle} size={24} />
                    </div>
                    <h2 className="mt-1.5 mb-0 font-display text-[23px]">
                      <Link
                        to={`/services/${page.slug}`}
                        className="text-inherit no-underline hover:text-primary"
                      >
                        {service.title}
                      </Link>
                    </h2>
                    <p className="m-0 text-[14.5px] leading-[1.6] text-ink/80">
                      {service.summary}
                    </p>
                    <div className="mt-0.5 flex flex-wrap gap-1.5">
                      {service.chips.map((chip) => (
                        <span
                          key={chip}
                          className="rounded-full bg-teal-tint px-2.5 py-0.5 text-[11px] text-teal"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                    <Link
                      to={`/services/${page.slug}`}
                      className="mt-auto pt-1.5 font-display text-sm text-primary no-underline hover:text-primary-deep"
                    >
                      Learn more →
                    </Link>
                  </li>
                );
              })}
        </ul>
      </section>

      <section className="bg-surface">
        <div className={`${WRAP} py-14`}>
          <span className={`${KICKER} mb-3`}>On the horizon</span>
          <h2 className="m-0 mb-2.5 font-display text-[clamp(28px,3.2vw,38px)]">
            Expanding responsibly
          </h2>
          <p className="mt-0 mb-8 max-w-[56ch] text-base leading-[1.65] text-ink/80">
            As the practice grows, we plan to add these evidence-based services
            with the same commitment to patient safety and informed consent.
          </p>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5.5 p-0">
            {FUTURE.map((item) => (
              <li
                key={item.title}
                className="flex flex-col gap-3 rounded-card border border-ink/15 bg-ground p-6.5"
              >
                <div className="flex items-center justify-between">
                  <div className="grid size-11.5 place-items-center rounded-full bg-teal-tint text-teal">
                    <Icon as={item.icon} size={24} />
                  </div>
                  <span className="rounded-full border border-primary px-2.5 py-0.5 text-[11px] text-primary">
                    Coming soon
                  </span>
                </div>
                <h3 className="mt-1 mb-0 font-display text-[21px]">
                  {item.title}
                </h3>
                <p className="m-0 text-[14.5px] leading-[1.6] text-ink/80">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={`${WRAP} pt-16 pb-18`}>
        <div className="flex flex-wrap items-center justify-between gap-7 rounded-card bg-teal-tint p-[clamp(32px,4vw,56px)]">
          <div>
            <h2 className="m-0 mb-2 font-display text-[clamp(24px,2.6vw,32px)]">
              Not sure where to start?
            </h2>
            <p className="m-0 max-w-[48ch] text-[15.5px] text-ink/80">
              Book a comprehensive evaluation and we'll recommend the right path
              for you.
            </p>
          </div>
          <Link to="/book" className={CTA_PRIMARY}>
            Book an appointment
          </Link>
        </div>
      </section>
    </MarketingPage>
  );
}
