import { Link } from "react-router";
import {
  Brain,
  Droplet,
  Leaf,
  Pill,
  Shield,
  Sparkles,
  Wind,
} from "lucide-react";
import {
  CTA_PRIMARY,
  HeaderBlob,
  Icon,
  KICKER,
  MarketingPage,
  WRAP,
  type IconType,
} from "./marketing-chrome";

const SERVICES: ReadonlyArray<{
  icon: IconType;
  title: string;
  body: string;
  chips: ReadonlyArray<string>;
  slug?: string;
}> = [
  {
    icon: Brain,
    title: "Mental Health Care",
    slug: "mental-health-care",
    body: "Comprehensive evaluations and individualized treatment for a wide range of psychiatric conditions.",
    chips: ["Depression", "Anxiety", "PTSD", "ADHD", "Bipolar"],
  },
  {
    icon: Pill,
    title: "Medication Management",
    slug: "medication-management",
    body: "An ongoing partnership — continuously evaluating response and adjusting to find the safest, most effective plan.",
    chips: ["Evaluation", "Follow-up", "Optimization"],
  },
  {
    icon: Shield,
    title: "Addiction Medicine",
    slug: "addiction-medicine",
    body: "Substance use disorders treated as chronic medical conditions, with a clear path toward long-term recovery.",
    chips: ["Opioids", "Alcohol", "Stimulants"],
  },
  {
    icon: Pill,
    title: "Medication-Assisted Treatment",
    slug: "medication-assisted-treatment",
    body: "FDA-approved medications plus behavioral support to reduce cravings and lower overdose risk.",
    chips: ["Suboxone", "Sublocade", "Vivitrol"],
  },
  {
    icon: Sparkles,
    title: "Ketamine Therapy",
    slug: "ketamine-therapy",
    body: "A rapid-acting option for treatment-resistant depression, with full medical monitoring at every session.",
    chips: ["TRD", "Severe depression", "PTSD"],
  },
  {
    icon: Leaf,
    title: "Holistic & Integrative Care",
    slug: "holistic-integrative-care",
    body: "Nutrition, sleep, hormones, stress and lifestyle assessed to find the underlying contributors to illness.",
    chips: ["Nutrition", "Sleep", "Lifestyle"],
  },
];

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
  return (
    <MarketingPage>
      <header className="relative">
        <HeaderBlob size={400} />
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
          {SERVICES.map((service) => (
            <li
              key={service.title}
              className="flex flex-col gap-3.5 rounded-organic bg-sand-deep p-7 shadow-organic-sm"
            >
              <div className="grid size-12.5 place-items-center rounded-full bg-clay-100 text-clay-700">
                <Icon as={service.icon} size={24} />
              </div>
              <h2 className="mt-1.5 mb-0 font-display text-[23px]">
                {service.slug ? (
                  <Link
                    to={`/services/${service.slug}`}
                    className="text-inherit no-underline hover:text-clay"
                  >
                    {service.title}
                  </Link>
                ) : (
                  service.title
                )}
              </h2>
              <p className="m-0 text-[14.5px] leading-[1.6] text-ink/80">
                {service.body}
              </p>
              <div className="mt-0.5 flex flex-wrap gap-1.5">
                {service.chips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full bg-sage-100 px-2.5 py-0.5 text-[11px] text-sage-800"
                  >
                    {chip}
                  </span>
                ))}
              </div>
              {service.slug && (
                <Link
                  to={`/services/${service.slug}`}
                  className="mt-auto pt-1.5 font-display text-sm text-clay no-underline hover:text-clay-600"
                >
                  Learn more →
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-sand-deep">
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
                className="flex flex-col gap-3 rounded-organic border border-ink/15 bg-sand p-6.5"
              >
                <div className="flex items-center justify-between">
                  <div className="grid size-11.5 place-items-center rounded-full bg-sage-100 text-sage-700">
                    <Icon as={item.icon} size={24} />
                  </div>
                  <span className="rounded-full border border-clay px-2.5 py-0.5 text-[11px] text-clay">
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
        <div className="flex flex-wrap items-center justify-between gap-7 rounded-organic bg-sage-100 p-[clamp(32px,4vw,56px)]">
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
