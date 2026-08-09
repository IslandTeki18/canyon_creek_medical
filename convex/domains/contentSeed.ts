import { internalMutation } from "../_generated/server";
import type { ServicePageContent } from "../lib/content";

type LegacyServicePageContent = Omit<ServicePageContent, "sections"> & {
  howItWorks: string[];
  indications: string[];
  steps: { title: string; body: string }[];
};

function sectionsFor(
  content: LegacyServicePageContent,
  idPrefix: string,
): ServicePageContent {
  const { howItWorks, indications, steps, ...rest } = content;
  return {
    ...rest,
    sections: [
      {
        id: `${idPrefix}-how-it-works`,
        type: "richText",
        text: howItWorks.join("\n\n"),
      },
      { id: `${idPrefix}-indications`, type: "itemGrid", items: indications },
      { id: `${idPrefix}-steps`, type: "numberedSteps", steps },
    ],
  };
}

const pages: ReadonlyArray<{
  slug: string;
  sortOrder: number;
  content: LegacyServicePageContent;
}> = [
  {
    slug: "mental-health-care",
    sortOrder: 0,
    content: {
      title: "Mental Health Care",
      icon: "brain",
      summary:
        "Comprehensive evaluations and individualized treatment for a wide range of psychiatric conditions.",
      chips: ["Depression", "Anxiety", "PTSD", "ADHD", "Bipolar"],
      tags: [
        { label: "Mental health", accent: true },
        { label: "Ongoing care" },
      ],
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
  },
  {
    slug: "medication-management",
    sortOrder: 1,
    content: {
      title: "Medication Management",
      icon: "pill",
      summary:
        "An ongoing partnership — continuously evaluating response and adjusting to find the safest, most effective plan.",
      chips: ["Evaluation", "Follow-up", "Optimization"],
      tags: [
        { label: "Mental health", accent: true },
        { label: "Ongoing care" },
      ],
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
  },
  {
    slug: "addiction-medicine",
    sortOrder: 2,
    content: {
      title: "Addiction Medicine",
      icon: "shield",
      summary:
        "Substance use disorders treated as chronic medical conditions, with a clear path toward long-term recovery.",
      chips: ["Opioids", "Alcohol", "Stimulants"],
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
  },
  {
    slug: "medication-assisted-treatment",
    sortOrder: 3,
    content: {
      title: "Medication-Assisted Treatment",
      icon: "pill",
      summary:
        "FDA-approved medications plus behavioral support to reduce cravings and lower overdose risk.",
      chips: ["Suboxone", "Sublocade", "Vivitrol"],
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
  },
  {
    slug: "ketamine-therapy",
    sortOrder: 4,
    content: {
      title: "Ketamine Therapy",
      icon: "sparkles",
      summary:
        "A rapid-acting option for treatment-resistant depression, with full medical monitoring at every session.",
      chips: ["TRD", "Severe depression", "PTSD"],
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
  },
  {
    slug: "holistic-integrative-care",
    sortOrder: 5,
    content: {
      title: "Holistic & Integrative Care",
      icon: "leaf",
      summary:
        "Nutrition, sleep, hormones, stress and lifestyle assessed to find the underlying contributors to illness.",
      chips: ["Nutrition", "Sleep", "Lifestyle"],
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
  },
];

export const seedServicePages = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const administrator = users.find(
      (user) =>
        user.status === "active" && user.roles.includes("administrator"),
    );
    if (!administrator) {
      throw new Error(
        "Cannot seed service pages without an active administrator",
      );
    }

    const now = Date.now();
    let inserted = 0;
    for (const page of pages) {
      const existing = await ctx.db
        .query("servicePages")
        .withIndex("by_slug", (q) => q.eq("slug", page.slug))
        .unique();
      if (existing) continue;
      await ctx.db.insert("servicePages", {
        ...page,
        content: sectionsFor(page.content, `service-${page.slug}`),
        status: "published",
        publishedAt: now,
        createdByUserId: administrator._id,
        createdAt: now,
        updatedAt: now,
      });
      inserted += 1;
    }
    return { inserted };
  },
});
