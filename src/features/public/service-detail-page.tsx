import { useQuery } from "convex/react";
import { Link, useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { ServicePageContent } from "../../../convex/lib/content";
import { NotFound } from "../../components/app-shell";
import { MarketingPage, WRAP } from "./marketing-chrome";
import { renderSections } from "./render-sections";

const TAG = "rounded-full px-2.5 py-[3px] text-[11px] tracking-[0.02em]";

type LegacyServicePageContent = Omit<ServicePageContent, "sections"> & {
  sections?: ServicePageContent["sections"];
  howItWorks: string[];
  indications: string[];
  steps: { title: string; body: string }[];
};

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
        <p role="status" className={`${WRAP} py-16 text-ink/70`}>
          Loading service…
        </p>
      </MarketingPage>
    );
  }
  const service = page.content as LegacyServicePageContent;

  return (
    <MarketingPage>
      <nav
        aria-label="Breadcrumb"
        className={`${WRAP} pt-7 text-[13.5px] text-ink/70`}
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
          {service.sections ? (
            renderSections(service.sections)
          ) : (
            <>
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
            </>
          )}

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
                  <dt className="text-[11px] font-semibold tracking-[0.06em] text-ink/70 uppercase">
                    {fact.k}
                  </dt>
                  <dd className="m-0 text-[14.5px]">{fact.v}</dd>
                </div>
              ))}
            </dl>
            <Link
              to="/book"
              className="mt-1 rounded-full bg-clay px-5.5 py-3 text-center font-display text-sm text-sand no-underline hover:bg-clay-600"
            >
              Book a consultation
            </Link>
            <Link
              to="/book"
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
