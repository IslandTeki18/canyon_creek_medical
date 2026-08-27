import { Link } from "react-router";
import { Brain, Heart, Leaf, Pill, Shield, Sparkles } from "lucide-react";
import {
  BLUE_PANEL,
  CTA_PRIMARY,
  CTA_SECONDARY,
  IconTile,
  KICKER,
  MarketingPage,
  WRAP,
  type IconType,
} from "./marketing-chrome";

const PILLARS: ReadonlyArray<{
  icon: IconType;
  tone: "primary" | "teal";
  title: string;
  body: string;
}> = [
  {
    icon: Brain,
    tone: "primary",
    title: "Evidence-based",
    body: "Grounded in current medical evidence.",
  },
  {
    icon: Leaf,
    tone: "teal",
    title: "Holistic",
    body: "Sleep, nutrition, hormones, lifestyle.",
  },
  {
    icon: Heart,
    tone: "primary",
    title: "Compassionate",
    body: "A medical condition, never a failing.",
  },
];

// Icons are fixed per service (DESIGN.md §7). Exactly one card per grid is
// the highlight: the flagship service.
const SERVICES: ReadonlyArray<{
  icon: IconType;
  tone: "primary" | "teal";
  title: string;
  body: string;
  highlight?: boolean;
}> = [
  {
    icon: Brain,
    tone: "primary",
    title: "Mental Health Care",
    body: "Comprehensive evaluation and individualized treatment for depression, anxiety, PTSD, ADHD, bipolar disorder and more.",
  },
  {
    icon: Sparkles,
    tone: "primary",
    title: "Ketamine Therapy",
    body: "A rapid-acting option for treatment-resistant depression, with full medical monitoring throughout each session.",
    highlight: true,
  },
  {
    icon: Shield,
    tone: "primary",
    title: "Addiction Medicine",
    body: "Substance use disorders treated as chronic medical conditions, with a path to long-term recovery.",
  },
  {
    icon: Pill,
    tone: "primary",
    title: "Medication-Assisted Treatment",
    body: "FDA-approved medications plus behavioral support for opioid and alcohol recovery — Suboxone, Sublocade, Vivitrol.",
  },
  {
    icon: Pill,
    tone: "primary",
    title: "Medication Management",
    body: "An ongoing partnership — we evaluate how you respond and adjust to find the safest, most effective plan.",
  },
  {
    icon: Leaf,
    tone: "teal",
    title: "Holistic & Integrative Care",
    body: "Nutrition, sleep, hormones, stress and lifestyle assessed to find the underlying contributors to illness.",
  },
];

const STEPS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "Reach out",
    body: "Request an appointment online or by phone. New patients are welcome and we’ll help you get started.",
  },
  {
    title: "Comprehensive evaluation",
    body: "A thorough review of your history, health, lifestyle and goals to understand the whole picture.",
  },
  {
    title: "Your personalized plan",
    body: "A treatment plan built around you, with regular follow-up to keep it working over time.",
  },
];

const CARD =
  "flex flex-col gap-3 rounded-card bg-surface p-7 shadow-card hover:shadow-card-raised";

export default function HomePage() {
  return (
    <MarketingPage>
      {/* Hero */}
      <section className={`${WRAP} pt-14`}>
        <div className="flex flex-wrap items-center gap-[clamp(28px,4vw,56px)] rounded-hero bg-surface p-[clamp(28px,4vw,56px)] shadow-panel">
          <div className="min-w-0 flex-[1_1_440px]">
            <span className="mb-5.5 inline-block rounded-full bg-primary-tint px-3.5 py-1.75 text-xs font-bold tracking-[0.04em] text-primary uppercase">
              Integrative psychiatry · addiction medicine
            </span>
            <h1 className="m-0 font-display text-[clamp(38px,4.6vw,62px)] leading-[1.06] tracking-[-0.03em]">
              Whole-person care for the mind and the{" "}
              <span className="text-primary">body</span>.
            </h1>
            <p className="mt-5.5 mb-0 max-w-[52ch] text-[16.5px] leading-[1.7] text-ink/70">
              An outpatient medical practice combining evidence-based
              psychiatry, addiction medicine, and holistic health — building
              comprehensive treatment plans that address the causes of illness,
              not only its symptoms.
            </p>
            <div className="mt-7.5 flex flex-wrap gap-3">
              <Link to="/book" className={CTA_PRIMARY}>
                Book an appointment
              </Link>
              <Link to="/services" className={CTA_SECONDARY}>
                Explore our services
              </Link>
            </div>
            <div className="mt-9 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-5 border-t border-ink/9 pt-6.5">
              {PILLARS.map((pillar) => (
                <div key={pillar.title} className="flex flex-col gap-1.5">
                  <IconTile as={pillar.icon} tone={pillar.tone} size={40} />
                  <span className="mt-1 text-[14.5px] font-bold">
                    {pillar.title}
                  </span>
                  <span className="text-[13px] leading-[1.55] text-ink/62">
                    {pillar.body}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <figure className="relative m-0 min-w-0 flex-[1_1_320px]">
            <img
              src="/images/home-hero.jpg"
              alt="A clinician talking with a patient across a desk"
              className="aspect-[4/4.6] w-full rounded-[26px] object-cover"
            />
            <figcaption className="absolute bottom-6.5 -left-4.5 rounded-[18px] bg-surface px-5 py-4 shadow-[0_10px_30px_rgba(11,37,69,.13)]">
              <span className="mb-1.5 block text-xs font-semibold tracking-[0.04em] text-ink/50 uppercase">
                Now accepting
              </span>
              <span className="block text-[15px] font-bold">New patients</span>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Services */}
      <section id="services" className={`${WRAP} scroll-mt-22 pt-19`}>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <span className={`${KICKER} mb-2.5`}>What we offer</span>
            <h2 className="m-0 font-display text-[clamp(30px,3.4vw,44px)] leading-[1.1]">
              Care that grows with you
            </h2>
          </div>
          <Link
            to="/services"
            className="text-sm font-semibold text-primary no-underline"
          >
            All services →
          </Link>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
          {SERVICES.map((service, index) => (
            <div
              key={service.title}
              className={
                service.highlight
                  ? "flex flex-col gap-3 rounded-card bg-primary p-7 text-white shadow-[0_12px_34px_rgba(33,102,232,.28)]"
                  : CARD
              }
            >
              <div className="flex items-center justify-between gap-3">
                <IconTile
                  as={service.icon}
                  tone={service.highlight ? "inverse" : service.tone}
                />
                <span
                  aria-hidden="true"
                  className={`text-[34px] leading-none font-extrabold tracking-[-0.03em] ${
                    service.highlight ? "text-white/42" : "text-primary-ghost"
                  }`}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="m-0 text-xl font-bold tracking-[-0.015em]">
                {service.title}
              </h3>
              <p
                className={`m-0 flex-1 text-[14.5px] leading-[1.65] ${
                  service.highlight ? "text-white/85" : "text-ink/68"
                }`}
              >
                {service.body}
              </p>
              <Link
                to="/book"
                className={`self-start border-b pb-0.5 text-[13.5px] font-semibold no-underline ${
                  service.highlight
                    ? "border-white/45 text-white hover:text-white"
                    : "border-primary/30 text-primary"
                }`}
              >
                Make an appointment
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Coming soon */}
      <section className={`${WRAP} pt-7`}>
        <div className="flex flex-wrap items-center justify-between gap-6 rounded-card bg-teal-tint px-8 py-6.5">
          <div>
            <h3 className="m-0 mb-1.5 text-[19px] font-bold tracking-[-0.015em]">
              Coming soon
            </h3>
            <p className="m-0 text-[14.5px] leading-[1.6] text-ink/72">
              We’re expanding responsibly — Spravato®, peptide therapy and
              hyperbaric oxygen therapy are on the way.
            </p>
          </div>
          <ul className="m-0 flex list-none flex-wrap gap-2.5 p-0">
            {["Spravato®", "Peptide therapy", "HBOT"].map((label) => (
              <li
                key={label}
                className="rounded-full bg-surface px-4 py-2 text-xs font-semibold text-teal"
              >
                {label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Philosophy */}
      <section id="approach" className={`${WRAP} scroll-mt-22 pt-18`}>
        <div className="flex flex-wrap items-center gap-[clamp(28px,4vw,64px)] rounded-hero bg-surface p-[clamp(28px,4vw,56px)] shadow-panel">
          <div className="min-w-0 flex-[1_1_460px]">
            <span className={`${KICKER} mb-3`}>Our philosophy</span>
            <h2 className="m-0 mb-4.5 font-display text-[clamp(28px,3.2vw,40px)] leading-[1.12]">
              Treating the whole person, not the symptom
            </h2>
            <p className="mt-0 mb-3.5 text-base leading-[1.75] text-ink/70">
              Mental health is shaped by many interconnected factors — brain
              chemistry, physical health, nutrition, sleep, hormones, trauma and
              environment. Rather than relying on medication alone, we build
              comprehensive plans across the biological, psychological and
              lifestyle factors affecting your health.
            </p>
            <p className="m-0 text-base leading-[1.75] text-ink/70">
              Our goal is to become a comprehensive center for behavioral health
              and regenerative medicine — expanding what we offer while staying
              committed to compassionate, patient-centered care.
            </p>
          </div>
          <figure className="m-0 min-w-0 flex-[1_1_300px]">
            <img
              src="/images/clinic-interior.jpg"
              alt="A bright waiting room with a sofa and large windows"
              loading="lazy"
              className="aspect-4/5 w-full rounded-[26px] object-cover"
            />
          </figure>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className={`${WRAP} scroll-mt-22 pt-18`}>
        <span className={`${KICKER} mb-2.5`}>How it works</span>
        <h2 className="m-0 mb-8 font-display text-[clamp(28px,3.2vw,42px)]">
          Getting started is simple
        </h2>
        <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5 p-0">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col gap-2.5 rounded-card bg-surface p-7 shadow-card"
            >
              <span
                aria-hidden="true"
                className="grid size-11 place-items-center rounded-[14px] bg-primary text-lg font-extrabold text-white"
              >
                {index + 1}
              </span>
              <h3 className="mt-1.5 mb-0 text-[19px] font-bold tracking-[-0.015em]">
                {step.title}
              </h3>
              <p className="m-0 text-[14.5px] leading-[1.65] text-ink/68">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* Testimonial */}
      <section className={`${WRAP} pt-19`}>
        <figure className="m-0 max-w-[62ch]">
          <blockquote className="m-0 text-[clamp(24px,2.9vw,36px)] leading-[1.3] font-bold tracking-[-0.025em] text-pretty">
            “They didn’t just adjust a prescription — they asked about my sleep,
            my history, my life. For the first time I felt like someone was{" "}
            <span className="text-primary">treating the cause</span>.”
          </blockquote>
          <figcaption className="mt-5.5 text-[15px] text-ink/60">
            — A patient in ongoing care
          </figcaption>
        </figure>
      </section>

      {/* Closing CTA */}
      <section className={`${WRAP} pt-15 pb-19`}>
        <div
          className={`${BLUE_PANEL} flex flex-wrap items-center justify-between gap-8`}
        >
          <div>
            <h2 className="m-0 mb-3 max-w-[24ch] font-display text-[clamp(26px,3vw,38px)] leading-[1.14]">
              Ready to take the first step?
            </h2>
            <p className="m-0 max-w-[50ch] text-base leading-[1.7] text-white/85">
              Book a comprehensive evaluation and we’ll build a plan around your
              goals. New patients welcome.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/book"
              className="rounded-full bg-surface px-6.5 py-3.75 text-[14.5px] font-bold text-primary no-underline hover:bg-primary-tint hover:text-primary-deep"
            >
              Book an appointment
            </Link>
            <Link
              to="/portal"
              className="rounded-full border-[1.5px] border-white/50 px-6.5 py-3.75 text-[14.5px] font-semibold text-white no-underline hover:bg-white/12 hover:text-white"
            >
              Patient portal
            </Link>
          </div>
        </div>
      </section>
    </MarketingPage>
  );
}
