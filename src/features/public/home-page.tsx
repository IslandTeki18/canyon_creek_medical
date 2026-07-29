import { Link } from "react-router";
import { Brain, Heart, Leaf, Pill, Shield, Sparkles } from "lucide-react";
import {
  CTA_PRIMARY,
  CTA_SECONDARY,
  HeaderBlob,
  Icon,
  KICKER,
  MarketingPage,
  WRAP,
  type IconType,
} from "./marketing-chrome";

const PILLARS: ReadonlyArray<{
  icon: IconType;
  tint: string;
  title: string;
  body: string;
}> = [
  {
    icon: Brain,
    tint: "bg-clay-100 text-clay-700",
    title: "Evidence-based",
    body: "Diagnoses and treatments grounded in current medical evidence and careful clinical judgment.",
  },
  {
    icon: Leaf,
    tint: "bg-sage-100 text-sage-700",
    title: "Holistic",
    body: "We look at sleep, nutrition, hormones, trauma and lifestyle — not just brain chemistry.",
  },
  {
    icon: Heart,
    tint: "bg-clay-100 text-clay-700",
    title: "Compassionate",
    body: "Addiction is treated as a medical condition, never a personal failure — with dignity and patience.",
  },
];

const SERVICES: ReadonlyArray<{ icon: IconType; title: string; body: string }> =
  [
    {
      icon: Brain,
      title: "Mental Health Care",
      body: "Comprehensive evaluation and individualized treatment for depression, anxiety, PTSD, ADHD, bipolar disorder and more.",
    },
    {
      icon: Pill,
      title: "Medication Management",
      body: "An ongoing partnership — we evaluate how you respond and adjust to find the safest, most effective plan.",
    },
    {
      icon: Shield,
      title: "Addiction Medicine",
      body: "Substance use disorders treated as chronic medical conditions, with a path to long-term recovery.",
    },
    {
      icon: Pill,
      title: "Medication-Assisted Treatment",
      body: "FDA-approved medications plus behavioral support for opioid and alcohol recovery — Suboxone, Sublocade, Vivitrol.",
    },
    {
      icon: Sparkles,
      title: "Ketamine Therapy",
      body: "A rapid-acting option for treatment-resistant depression, with full medical monitoring throughout each session.",
    },
    {
      icon: Leaf,
      title: "Holistic & Integrative Care",
      body: "Nutrition, sleep, hormones, stress and lifestyle assessed to find the underlying contributors to illness.",
    },
  ];

const STEPS: ReadonlyArray<{ n: string; title: string; body: string }> = [
  {
    n: "1",
    title: "Reach out",
    body: "Request an appointment online or by phone. New patients are welcome and we’ll help you get started.",
  },
  {
    n: "2",
    title: "Comprehensive evaluation",
    body: "A thorough review of your history, health, lifestyle and goals to understand the whole picture.",
  },
  {
    n: "3",
    title: "Your personalized plan",
    body: "A treatment plan built around you, with regular follow-up to keep it working over time.",
  },
];

export default function HomePage() {
  return (
    <MarketingPage>
      {/* Hero */}
      <section className="relative">
        <HeaderBlob size={440} />
        <div className={`${WRAP} relative z-10 pt-16 pb-18`}>
          <span className={`${KICKER} mb-5`}>
            Integrative psychiatry · addiction medicine · holistic care
          </span>
          <h1 className="m-0 max-w-[16ch] font-display text-[clamp(42px,5.6vw,74px)] leading-[1.05] tracking-[-0.01em]">
            Whole-person care for the mind and the body.
          </h1>
          <p className="mt-6 mb-0 max-w-[56ch] text-[17px] leading-[1.65] text-ink/80">
            An outpatient medical practice combining evidence-based psychiatry,
            addiction medicine, and holistic health — building comprehensive
            treatment plans that address the causes of illness, not only its
            symptoms.
          </p>
          <div className="mt-8 flex flex-wrap gap-3.5">
            <Link to="/book" className={CTA_PRIMARY}>
              Book an appointment
            </Link>
            <Link to="/services" className={CTA_SECONDARY}>
              Explore our services
            </Link>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className={`${WRAP} pb-4`}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5">
          {PILLARS.map((pillar) => (
            <div key={pillar.title} className="flex flex-col gap-2">
              <div
                className={`grid size-11 place-items-center rounded-full ${pillar.tint}`}
              >
                <Icon as={pillar.icon} />
              </div>
              <h3 className="mt-1.5 mb-0 font-display text-[19px]">
                {pillar.title}
              </h3>
              <p className="m-0 text-[14.5px] leading-[1.6] text-ink/75">
                {pillar.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Services */}
      <section id="services" className={`${WRAP} scroll-mt-8 pt-18 pb-6`}>
        <div className="mb-7">
          <span className={`${KICKER} mb-2.5`}>What we offer</span>
          <h2 className="m-0 font-display text-[clamp(30px,3.4vw,42px)]">
            Care that grows with you
          </h2>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
          {SERVICES.map((service) => (
            <div
              key={service.title}
              className="flex h-full flex-col gap-3 rounded-organic bg-sand-deep p-6 shadow-organic-sm"
            >
              <div className="mb-1 grid size-11.5 place-items-center rounded-full bg-clay-100 text-clay-700">
                <Icon as={service.icon} />
              </div>
              <h3 className="font-display text-xl leading-tight">
                {service.title}
              </h3>
              <p className="m-0 flex-1 text-sm text-ink/80">{service.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Coming soon */}
      <section className={`${WRAP} pt-12 pb-6`}>
        <div className="flex flex-wrap items-center justify-between gap-5 rounded-organic bg-sage-100 px-6.5 py-5.5">
          <div>
            <h3 className="mt-0 mb-1 font-display text-xl">Coming soon</h3>
            <p className="m-0 text-[14.5px] text-ink/80">
              We’re expanding responsibly — Spravato®, peptide therapy and
              hyperbaric oxygen therapy are on the way.
            </p>
          </div>
          <ul className="m-0 flex list-none flex-wrap gap-2.5 p-0">
            {["Spravato®", "Peptide therapy", "HBOT"].map((label) => (
              <li
                key={label}
                className="rounded-full border border-clay px-3.5 py-1.5 text-[11px] text-clay"
              >
                {label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Philosophy */}
      <section id="approach" className={`${WRAP} scroll-mt-8 pt-16 pb-12`}>
        <div className="grid items-center gap-[clamp(28px,5vw,80px)] md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div>
            <span className={`${KICKER} mb-3`}>Our philosophy</span>
            <h2 className="m-0 mb-4.5 font-display text-[clamp(28px,3.2vw,38px)] leading-[1.12]">
              Treating the whole person, not the symptom
            </h2>
            <p className="mt-0 mb-3.5 text-base leading-[1.7] text-ink/80">
              Mental health is shaped by many interconnected factors — brain
              chemistry, physical health, nutrition, sleep, hormones, trauma and
              environment. Rather than relying on medication alone, we build
              comprehensive plans across the biological, psychological and
              lifestyle factors affecting your health.
            </p>
            <p className="m-0 text-base leading-[1.7] text-ink/80">
              Our goal is to become a comprehensive center for behavioral health
              and regenerative medicine — expanding what we offer while staying
              committed to compassionate, patient-centered care.
            </p>
          </div>
          {/* ponytail: tinted placeholder stands in for the clinic photo the
                design slots here; drop the asset in and swap for an <img>. */}
          <div
            aria-hidden="true"
            className="aspect-4/5 rounded-organic bg-sand-deep shadow-organic-md"
          />
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-8 bg-sand-deep">
        <div className={`${WRAP} py-16`}>
          <span className={`${KICKER} mb-3`}>How it works</span>
          <h2 className="m-0 mb-9 font-display text-[clamp(28px,3.2vw,38px)]">
            Getting started is simple
          </h2>
          <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-7 p-0">
            {STEPS.map((step) => (
              <li key={step.n} className="flex flex-col gap-2.5">
                <div className="grid size-12 place-items-center rounded-full bg-clay font-display text-[22px] text-sand">
                  {step.n}
                </div>
                <h3 className="mt-1.5 mb-0 font-display text-xl">
                  {step.title}
                </h3>
                <p className="m-0 text-[14.5px] leading-[1.6] text-ink/80">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Testimonial */}
      <section className={`${WRAP} pt-18 pb-14`}>
        <figure className="m-0 max-w-[60ch]">
          <blockquote className="m-0 font-display text-[clamp(24px,2.8vw,34px)] leading-[1.35]">
            “They didn’t just adjust a prescription — they asked about my sleep,
            my history, my life. For the first time I felt like someone was
            treating the cause.”
          </blockquote>
          <figcaption className="mt-5.5 text-[15px] text-ink/70">
            — A patient in ongoing care
          </figcaption>
        </figure>
      </section>

      {/* Closing CTA */}
      <section className={`${WRAP} pb-18`}>
        <div className="rounded-organic bg-sage-100 p-[clamp(32px,4vw,56px)]">
          <h2 className="m-0 mb-3 max-w-[22ch] font-display text-[clamp(26px,3vw,36px)]">
            Ready to take the first step?
          </h2>
          <p className="mt-0 mb-6 max-w-[52ch] text-base leading-[1.65] text-ink/80">
            Book a comprehensive evaluation and we’ll build a plan around your
            goals. New patients welcome.
          </p>
          <div className="flex flex-wrap gap-3.5">
            <Link to="/book" className={CTA_PRIMARY}>
              Book an appointment
            </Link>
            <Link to="/portal" className={CTA_SECONDARY}>
              Patient portal
            </Link>
          </div>
        </div>
      </section>
    </MarketingPage>
  );
}
