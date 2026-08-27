import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ShieldCheck } from "lucide-react";
import { Link, useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { ServicePageContent } from "../../../convex/lib/content";
import { NotFound } from "../../components/app-shell";
import {
  BLUE_PANEL,
  CTA_PRIMARY,
  CTA_SECONDARY,
  IconTile,
  MarketingPage,
  Placeholder,
  WRAP,
} from "./marketing-chrome";
import { renderSections } from "./render-sections";

const TAG = "rounded-full px-3.75 py-1.75 text-xs tracking-[0.02em]";

type PublicServicePageContent = Omit<ServicePageContent, "sections"> & {
  sections?: ServicePageContent["sections"];
  howItWorks: string[];
  indications: string[];
  steps: { title: string; body: string }[];
};

type ServicePage = NonNullable<
  FunctionReturnType<typeof api.domains.content.getPublishedServicePage>
>;

export function ServiceDetailView({ page }: { page: ServicePage }) {
  const service = page.content as PublicServicePageContent;
  const sections =
    service.sections ??
    ([
      {
        id: "legacy-how-it-works",
        type: "richText",
        text: service.howItWorks.join("\n\n"),
      },
      {
        id: "legacy-indications",
        type: "itemGrid",
        items: service.indications,
      },
      { id: "legacy-steps", type: "numberedSteps", steps: service.steps },
    ] as const);

  return (
    <MarketingPage>
      <nav
        aria-label="Breadcrumb"
        className={`${WRAP} pt-7 text-[13.5px] text-ink/60`}
      >
        <Link
          to="/services"
          className="text-inherit no-underline hover:text-primary"
        >
          Services
        </Link>
        <span className="mx-2">/</span>
        <span className="font-semibold text-ink">{service.title}</span>
      </nav>

      <header className={`${WRAP} pt-6`}>
        <div className="mb-5 flex flex-wrap gap-2.5">
          {service.tags.map((tag) => (
            <span
              key={tag.label}
              className={`${TAG} ${
                tag.accent
                  ? "bg-primary-tint font-bold text-primary-deep"
                  : "bg-surface font-semibold text-ink/70"
              }`}
            >
              {tag.label}
            </span>
          ))}
        </div>
        <h1 className="m-0 max-w-[16ch] font-display text-[clamp(38px,5vw,66px)] leading-[1.04] tracking-[-0.03em]">
          {service.title}
        </h1>
        <p className="mt-5.5 mb-0 max-w-[60ch] text-[17px] leading-[1.7] text-ink/70">
          {service.intro}
        </p>
      </header>

      <div className={`${WRAP} pt-8`}>
        {page.coverImage?.url ? (
          <img
            src={page.coverImage.url}
            alt={page.coverImage.alt}
            className="aspect-[21/9] w-full rounded-panel object-cover shadow-panel"
          />
        ) : (
          <Placeholder
            label="cover image"
            className="aspect-[21/9] rounded-panel shadow-panel"
          />
        )}
      </div>

      <div
        className={`${WRAP} flex flex-wrap items-start gap-[clamp(32px,5vw,72px)] pt-12`}
      >
        <main className="flex min-w-0 flex-[1_1_560px] flex-col gap-7">
          {renderSections(sections, "service", page.imageUrls)}

          <section className="grid grid-cols-[44px_minmax(0,1fr)] items-start gap-4.5 rounded-panel bg-teal-tint px-8 py-7">
            <IconTile as={ShieldCheck} tone="surface" />
            <div>
              <h3 className="m-0 mb-2 text-[19px] font-bold tracking-[-0.015em]">
                A note on safety
              </h3>
              <p className="m-0 text-[15px] leading-[1.75] text-ink/78">
                {service.safetyNote}
              </p>
            </div>
          </section>
        </main>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4 lg:sticky lg:top-24">
          <div className="rounded-panel bg-surface p-7 shadow-[0_10px_34px_rgba(11,37,69,.08)]">
            <h3 className="m-0 mb-4.5 text-[19px] font-bold tracking-[-0.015em]">
              Quick facts
            </h3>
            <dl className="m-0 flex flex-col gap-3.5">
              {service.facts.map((fact) => (
                <div
                  key={fact.k}
                  className="flex flex-col gap-1 border-b border-ink/9 pb-3.25 last:border-b-0 last:pb-0"
                >
                  <dt className="text-[11px] font-bold tracking-[0.07em] text-ink/50 uppercase">
                    {fact.k}
                  </dt>
                  <dd className="m-0 text-[14.5px] font-semibold">{fact.v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 flex flex-col gap-2.5">
              <Link to="/book" className={`${CTA_PRIMARY} text-center`}>
                Book a consultation
              </Link>
              <Link to="/book" className={`${CTA_SECONDARY} text-center`}>
                Ask a question
              </Link>
            </div>
          </div>
          <div className="rounded-card bg-surface p-6 shadow-[0_2px_14px_rgba(11,37,69,.04)]">
            <span className="mb-3.5 block text-[11px] font-bold tracking-[0.08em] text-primary uppercase">
              Related
            </span>
            <Link
              to="/services"
              className="flex items-center justify-between gap-3 text-[14.5px] font-semibold text-primary no-underline"
            >
              All services <span aria-hidden="true">→</span>
            </Link>
          </div>
        </aside>
      </div>

      <section className={`${WRAP} pt-16 pb-19`}>
        <div
          className={`${BLUE_PANEL} flex flex-wrap items-center justify-between gap-8`}
        >
          <div>
            <h2 className="m-0 mb-2.5 max-w-[24ch] font-display text-[clamp(24px,2.8vw,34px)] leading-[1.16]">
              Not sure whether {service.title.toLowerCase()} is right for you?
            </h2>
            <p className="m-0 max-w-[50ch] text-[15.5px] leading-[1.7] text-white/85">
              Book a comprehensive evaluation and we’ll recommend the right path
              for you.
            </p>
          </div>
          <Link
            to="/book"
            className="rounded-full bg-surface px-6.5 py-3.75 text-[14.5px] font-bold text-primary no-underline hover:bg-primary-tint hover:text-primary-deep"
          >
            Book an appointment
          </Link>
        </div>
      </section>
    </MarketingPage>
  );
}

export default function ServiceDetailPage() {
  const { slug } = useParams();
  const page = useQuery(
    api.domains.content.getPublishedServicePage,
    slug ? { slug } : "skip",
  );
  if (!slug || page === null) return <NotFound />;
  if (page === undefined) {
    return (
      <MarketingPage>
        <p role="status" className={`${WRAP} py-16 text-ink/60`}>
          Loading service…
        </p>
      </MarketingPage>
    );
  }
  return <ServiceDetailView page={page} />;
}
