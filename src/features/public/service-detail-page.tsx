import { Link, useParams } from "react-router";
import { NotFound } from "../../components/app-shell";
import { MarketingPage, WRAP } from "./marketing-chrome";

interface ServiceDetail {
  title: string;
  tags: ReadonlyArray<{ label: string; accent?: boolean }>;
  intro: string;
  howItWorks: ReadonlyArray<string>;
  indications: ReadonlyArray<string>;
  steps: ReadonlyArray<{ title: string; body: string }>;
  facts: ReadonlyArray<{ k: string; v: string }>;
  safetyNote: string;
}

// Draft marketing copy pending clinical review. Unapproved modules (Spravato,
// peptides, HBOT) stay off this list until their feature flags are approved.
const SERVICE_DETAILS: Record<string, ServiceDetail> = {
  "mental-health-care": {
    title: "Mental Health Care",
    tags: [{ label: "Mental health", accent: true }, { label: "Ongoing care" }],
    intro:
      "Comprehensive psychiatric evaluations and individualized treatment for a wide range of mental health conditions. Care plans are built around the whole person — your history, your goals, and what has or hasn't worked before.",
    howItWorks: [
      "Care begins with a thorough evaluation covering your medical and psychiatric history, current symptoms, and life circumstances. From there, your clinician works with you to build a treatment plan, which may include medication, therapy referrals, lifestyle changes, or a combination.",
      "Treatment is an ongoing partnership: follow-up visits track how you're responding so the plan can be adjusted as your needs change.",
    ],
    indications: [
      "Depression",
      "Anxiety Disorders",
      "PTSD",
      "ADHD",
      "Bipolar Disorder",
      "OCD",
    ],
    steps: [
      {
        title: "Comprehensive evaluation",
        body: "An in-depth first visit to understand your history, symptoms, and goals for treatment.",
      },
      {
        title: "Personalized plan",
        body: "Together we build a treatment plan tailored to your diagnosis, preferences, and circumstances.",
      },
      {
        title: "Active treatment",
        body: "Your plan is put into practice, with support from our team along the way.",
      },
      {
        title: "Follow-up & adjustment",
        body: "Regular visits track your progress and refine the plan as your needs evolve.",
      },
    ],
    facts: [
      { k: "Category", v: "Psychiatric care" },
      { k: "Setting", v: "In-office visits" },
      { k: "First visit", v: "Comprehensive evaluation" },
      { k: "Best for", v: "New and ongoing mental health needs" },
    ],
    safetyNote:
      "Diagnosis and treatment decisions are made by your clinician during your visits. This page is informational and not a substitute for medical advice. If you are in crisis, call or text 988 for the Suicide & Crisis Lifeline.",
  },
  "medication-management": {
    title: "Medication Management",
    tags: [{ label: "Mental health", accent: true }, { label: "Ongoing care" }],
    intro:
      "Psychiatric medications work best with careful, ongoing oversight. We continuously evaluate your response and adjust to find the safest, most effective plan — not just a prescription and a wave goodbye.",
    howItWorks: [
      "Medication management starts with a review of your current and past medications, what helped, what didn't, and any side effects. Your clinician then recommends a plan, explains the tradeoffs, and answers your questions before anything is prescribed.",
      "Follow-up visits monitor effectiveness, side effects, and interactions, so doses and medications can be adjusted with a clear picture of how you're actually doing.",
    ],
    indications: [
      "Starting a new medication",
      "Reviewing current medications",
      "Managing side effects",
      "Simplifying complex regimens",
      "Transferring care",
      "Second opinions",
    ],
    steps: [
      {
        title: "Medication review",
        body: "A full review of your current and past medications, responses, and side effects.",
      },
      {
        title: "Plan & education",
        body: "Your clinician recommends a plan and walks through how each medication works and what to expect.",
      },
      {
        title: "Monitoring",
        body: "Follow-up visits track effectiveness and side effects so nothing drifts unnoticed.",
      },
      {
        title: "Optimization",
        body: "Doses and medications are adjusted over time toward the safest, most effective regimen.",
      },
    ],
    facts: [
      { k: "Category", v: "Psychiatric care" },
      { k: "Setting", v: "In-office visits" },
      { k: "Visit cadence", v: "Regular follow-ups" },
      { k: "Best for", v: "Anyone taking psychiatric medication" },
    ],
    safetyNote:
      "Medication decisions are made by your clinician based on your evaluation and ongoing monitoring. Never start, stop, or change a medication without medical guidance. This page is informational and not a substitute for medical advice.",
  },
  "addiction-medicine": {
    title: "Addiction Medicine",
    tags: [
      { label: "Addiction medicine", accent: true },
      { label: "Confidential care" },
    ],
    intro:
      "Substance use disorders are chronic medical conditions — not moral failings. We treat them the way medicine treats any chronic illness: with evaluation, evidence-based treatment, and long-term support toward recovery.",
    howItWorks: [
      "Treatment begins with a confidential evaluation of your substance use history, physical and mental health, and goals. Your clinician then builds a plan that may combine medication, behavioral support, and coordination with therapy or community resources.",
      "Recovery is rarely linear. Ongoing visits provide accountability, adjust treatment as circumstances change, and address co-occurring conditions like depression or anxiety alongside substance use.",
    ],
    indications: [
      "Opioid Use Disorder",
      "Alcohol Use Disorder",
      "Stimulant Use Disorder",
      "Sedative & Benzodiazepine Use",
      "Cannabis Use Disorder",
      "Co-occurring Conditions",
    ],
    steps: [
      {
        title: "Confidential evaluation",
        body: "A judgment-free review of your substance use, health history, and what you want treatment to achieve.",
      },
      {
        title: "Treatment plan",
        body: "An individualized plan combining medical treatment, behavioral support, and outside resources as needed.",
      },
      {
        title: "Active treatment",
        body: "Regular visits provide medical oversight, support, and adjustments as recovery progresses.",
      },
      {
        title: "Long-term recovery",
        body: "Care continues past early stabilization, supporting sustained recovery and relapse prevention.",
      },
    ],
    facts: [
      { k: "Category", v: "Addiction medicine" },
      { k: "Setting", v: "In-office, confidential" },
      { k: "Approach", v: "Chronic-disease model of care" },
      { k: "Best for", v: "Substance use concerns at any stage" },
    ],
    safetyNote:
      "Treatment decisions are made by your clinician during your evaluation and ongoing care. This page is informational and not a substitute for medical advice. If you are experiencing a medical emergency or overdose, call 911.",
  },
  "medication-assisted-treatment": {
    title: "Medication-Assisted Treatment",
    tags: [
      { label: "Addiction medicine", accent: true },
      { label: "Medically monitored" },
    ],
    intro:
      "Medication-assisted treatment (MAT) combines FDA-approved medications with behavioral support to reduce cravings, ease withdrawal, and lower overdose risk — one of the most effective, evidence-based approaches to treating substance use disorders.",
    howItWorks: [
      "MAT medications work by stabilizing the brain chemistry that substance use disrupts — reducing cravings and withdrawal so you can focus on recovery rather than fighting your own physiology. Which medication fits, if any, is determined during your medical evaluation.",
      "Medication is one part of the plan, not the whole plan: visits pair it with behavioral support and ongoing monitoring, and the regimen is adjusted as recovery progresses.",
    ],
    indications: [
      "Opioid Use Disorder",
      "Alcohol Use Disorder",
      "Withdrawal Management",
      "Craving Reduction",
      "Overdose Risk Reduction",
      "Relapse Prevention",
    ],
    steps: [
      {
        title: "Medical evaluation",
        body: "A full assessment determines whether MAT is appropriate and which medication fits your situation.",
      },
      {
        title: "Induction & stabilization",
        body: "Medication is started under medical guidance and adjusted until cravings and withdrawal are controlled.",
      },
      {
        title: "Maintenance",
        body: "Regular visits monitor your progress, with behavioral support alongside the medication.",
      },
      {
        title: "Ongoing recovery",
        body: "The plan evolves with you — duration of treatment is an individual decision made with your clinician.",
      },
    ],
    facts: [
      { k: "Category", v: "Addiction medicine" },
      { k: "Setting", v: "In-office, medically monitored" },
      { k: "Medications", v: "FDA-approved options only" },
      { k: "Best for", v: "Opioid and alcohol use disorders" },
    ],
    safetyNote:
      "Medication-assisted treatment is prescribed and monitored by a licensed clinician; candidacy and medication choice are determined during your evaluation. This page is informational and not a substitute for medical advice.",
  },
  "holistic-integrative-care": {
    title: "Holistic & Integrative Care",
    tags: [
      { label: "Whole-person care", accent: true },
      { label: "Evidence-based" },
    ],
    intro:
      "Mental health doesn't exist in isolation. Nutrition, sleep, hormones, stress, and lifestyle all shape how you feel — so we assess them alongside conventional treatment to find the underlying contributors to illness.",
    howItWorks: [
      "Integrative care starts with a broad look at your health: sleep quality, nutrition, physical activity, stress, hormonal balance, and relevant lab work. The goal is to identify factors that may be driving or worsening symptoms rather than treating symptoms in isolation.",
      "Findings feed back into your overall treatment plan — lifestyle changes and targeted interventions work alongside, not instead of, conventional psychiatric care.",
    ],
    indications: [
      "Sleep Difficulties",
      "Fatigue & Low Energy",
      "Nutrition & Metabolic Health",
      "Chronic Stress",
      "Hormonal Contributors",
      "Lifestyle Optimization",
    ],
    steps: [
      {
        title: "Whole-person assessment",
        body: "A broad evaluation of sleep, nutrition, stress, activity, and relevant labs.",
      },
      {
        title: "Identify contributors",
        body: "Your clinician looks for underlying factors that may be driving or worsening symptoms.",
      },
      {
        title: "Integrated plan",
        body: "Lifestyle and targeted interventions are woven into your existing treatment plan.",
      },
      {
        title: "Track & refine",
        body: "Follow-ups measure what's actually improving and refine the approach over time.",
      },
    ],
    facts: [
      { k: "Category", v: "Integrative medicine" },
      { k: "Setting", v: "In-office visits" },
      { k: "Approach", v: "Complements conventional care" },
      { k: "Best for", v: "Symptoms with lifestyle contributors" },
    ],
    safetyNote:
      "Integrative recommendations are made by your clinician as part of a comprehensive treatment plan and complement — never replace — conventional medical care. This page is informational and not a substitute for medical advice.",
  },
  "ketamine-therapy": {
    title: "Ketamine Therapy",
    tags: [
      { label: "Mental health", accent: true },
      { label: "Medically monitored" },
    ],
    intro:
      "An innovative option for patients with treatment-resistant mental health conditions. Unlike traditional antidepressants that may take weeks, ketamine has shown rapid antidepressant effects for many patients.",
    howItWorks: [
      "Ketamine works by affecting glutamate pathways within the brain, increasing neuroplasticity and promoting the formation of new neural connections. This mechanism differs from conventional antidepressants and is part of why some patients respond when other treatments haven't helped.",
      "Each treatment session includes medical monitoring before, during and after administration to ensure your safety and comfort throughout.",
    ],
    indications: [
      "Treatment-Resistant Depression",
      "Severe Depression",
      "Suicidal Ideation",
      "PTSD",
      "Anxiety Disorders",
      "Chronic Pain Syndromes",
    ],
    steps: [
      {
        title: "Evaluation & candidacy",
        body: "A thorough review of your history and current health determines whether ketamine therapy is appropriate for you.",
      },
      {
        title: "Preparation",
        body: "We explain the process, answer your questions, and check vital signs before the session begins.",
      },
      {
        title: "Monitored session",
        body: "Treatment is administered while our team monitors you closely before, during and after.",
      },
      {
        title: "Recovery & follow-up",
        body: "You recover in the office, and we track your response over time to refine the ongoing plan.",
      },
    ],
    facts: [
      { k: "Category", v: "Advanced depression treatment" },
      { k: "Setting", v: "In-office, medically monitored" },
      { k: "Onset", v: "Rapid — often within hours to days" },
      { k: "Best for", v: "Treatment-resistant conditions" },
    ],
    safetyNote:
      "Ketamine therapy is provided under medical supervision as part of a comprehensive treatment plan. Candidacy is determined during your evaluation. This page is informational and not a substitute for medical advice.",
  },
};

const TAG = "rounded-full px-2.5 py-[3px] text-[11px] tracking-[0.02em]";

export default function ServiceDetailPage() {
  const { slug } = useParams();
  const service = slug ? SERVICE_DETAILS[slug] : undefined;
  if (!service) return <NotFound />;

  return (
    <MarketingPage>
      <nav
        aria-label="Breadcrumb"
        className={`${WRAP} pt-7 text-[13.5px] text-ink/60`}
      >
        <Link
          to="/services"
          className="text-inherit no-underline hover:text-clay"
        >
          Services
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ink">{service.title}</span>
      </nav>

      <header className={`${WRAP} pt-6 pb-9`}>
        <div className="mb-4 flex flex-wrap gap-2.5">
          {service.tags.map((tag) => (
            <span
              key={tag.label}
              className={`${TAG} ${
                tag.accent
                  ? "bg-clay-100 text-clay-800"
                  : "bg-neutral-100 text-neutral-800"
              }`}
            >
              {tag.label}
            </span>
          ))}
        </div>
        <h1 className="m-0 max-w-[16ch] font-display text-[clamp(38px,5vw,66px)] leading-[1.04] tracking-[-0.01em]">
          {service.title}
        </h1>
        <p className="mt-5.5 mb-0 max-w-[60ch] text-[17px] leading-[1.65] text-ink/80">
          {service.intro}
        </p>
      </header>

      <div className={`${WRAP} pb-6`}>
        <div
          aria-hidden="true"
          className="aspect-[21/9] rounded-organic bg-sand-deep shadow-organic-md"
        />
      </div>

      <div
        className={`${WRAP} grid grid-cols-1 items-start gap-[clamp(32px,5vw,72px)] pt-10 pb-18 lg:grid-cols-[minmax(0,1fr)_320px]`}
      >
        <main>
          <section className="mb-11">
            <h2 className="m-0 mb-3.5 font-display text-[28px]">
              How it works
            </h2>
            {service.howItWorks.map((paragraph) => (
              <p
                key={paragraph}
                className="mt-0 mb-3.5 text-base leading-[1.75] text-ink/85 last:mb-0"
              >
                {paragraph}
              </p>
            ))}
          </section>

          <section className="mb-11">
            <h2 className="m-0 mb-4 font-display text-[28px]">
              Potential treatment indications
            </h2>
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 p-0">
              {service.indications.map((indication) => (
                <li
                  key={indication}
                  className="flex items-center gap-3 rounded-2xl bg-sand-deep px-4 py-3.5"
                >
                  <span className="size-[9px] flex-none rounded-full bg-clay" />
                  <span className="text-[14.5px]">{indication}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mb-11">
            <h2 className="m-0 mb-5 font-display text-[28px]">
              What to expect
            </h2>
            <ol className="m-0 flex list-none flex-col gap-5.5 p-0">
              {service.steps.map((step, index) => (
                <li key={step.title} className="flex items-start gap-4.5">
                  <span className="grid size-[42px] flex-none place-items-center rounded-full bg-clay font-display text-[19px] text-sand">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="mt-1 mb-1.5 font-display text-[19px]">
                      {step.title}
                    </h3>
                    <p className="m-0 text-[14.5px] leading-[1.65] text-ink/80">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-organic bg-sage-100 px-7 py-6.5">
            <h3 className="m-0 mb-2 font-display text-[20px]">
              A note on safety
            </h3>
            <p className="m-0 text-[14.5px] leading-[1.7] text-ink/85">
              {service.safetyNote}
            </p>
          </section>
        </main>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
          <div className="flex flex-col gap-3.5 rounded-organic bg-sand-deep p-6 shadow-organic-md">
            <h3 className="m-0 font-display text-[20px]">Quick facts</h3>
            <dl className="m-0 flex flex-col gap-3">
              {service.facts.map((fact) => (
                <div
                  key={fact.k}
                  className="flex flex-col gap-0.5 border-b border-ink/15 pb-2.5"
                >
                  <dt className="text-[11px] font-semibold tracking-[0.06em] text-ink/60 uppercase">
                    {fact.k}
                  </dt>
                  <dd className="m-0 text-[14.5px]">{fact.v}</dd>
                </div>
              ))}
            </dl>
            <Link
              to="/portal/appointments"
              className="mt-1 rounded-full bg-clay px-5.5 py-3 text-center font-display text-sm text-sand no-underline hover:bg-clay-600"
            >
              Book a consultation
            </Link>
            <Link
              to="/portal/appointments"
              className="rounded-full border border-ink/15 px-5.5 py-3 text-center font-display text-sm text-ink no-underline hover:bg-ink/7"
            >
              Ask a question
            </Link>
          </div>
          <div className="rounded-organic border border-ink/15 px-5.5 py-5">
            <span className="mb-2 block text-[11px] font-semibold tracking-[0.06em] text-clay-700 uppercase">
              Related
            </span>
            <div className="flex flex-col gap-2 text-sm">
              <Link
                to="/services"
                className="text-inherit no-underline hover:text-clay"
              >
                All services →
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </MarketingPage>
  );
}
