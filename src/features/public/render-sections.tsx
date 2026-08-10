import type { Section } from "../../../convex/lib/content";

const PARAGRAPH = "mt-0 mb-5 text-[17px] leading-[1.8] text-ink/85";

export function headingId(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Body blocks are blank-line-separated. Two lightweight markers give authors
 * article structure without a markdown dependency: "## " for section headings
 * (which also feed the table of contents) and "> " for a pull-quote.
 */
export function parseBody(body: string) {
  return body.split(/\n\s*\n/).map((block) => {
    const text = block.trim();
    if (text.startsWith("## ")) {
      return { kind: "heading" as const, text: text.slice(3).trim() };
    }
    if (text.startsWith("> ")) {
      return {
        kind: "quote" as const,
        text: text.replace(/^> ?/gm, "").trim(),
      };
    }
    return { kind: "paragraph" as const, text };
  });
}

export function renderSections(
  sections: Section[],
  variant: "blog" | "service" = "blog",
) {
  return sections.map((section) => {
    switch (section.type) {
      case "richText":
        if (variant === "service") {
          return (
            <section key={section.id} className="mb-11">
              <h2 className="m-0 mb-3.5 font-display text-[28px]">
                How it works
              </h2>
              {parseBody(section.text).map((block, index) => (
                <p
                  key={`${section.id}-${index}`}
                  className="mt-0 mb-3.5 text-base leading-[1.75] text-ink/85 last:mb-0"
                >
                  {block.text}
                </p>
              ))}
            </section>
          );
        }
        return parseBody(section.text).map((block, index) =>
          block.kind === "heading" ? (
            <h2
              key={`${section.id}-${index}`}
              id={headingId(block.text)}
              className="mt-10 mb-3.5 scroll-mt-6 font-display text-[29px]"
            >
              {block.text}
            </h2>
          ) : block.kind === "quote" ? (
            <figure
              key={`${section.id}-${index}`}
              className="my-8 rounded-organic bg-sage-100 px-8 py-7"
            >
              <blockquote className="m-0 font-display text-[23px] leading-[1.4]">
                {block.text}
              </blockquote>
            </figure>
          ) : (
            <p key={`${section.id}-${index}`} className={PARAGRAPH}>
              {block.text}
            </p>
          ),
        );
      case "numberedSteps":
        if (variant === "service") {
          return (
            <section key={section.id} className="mb-11">
              <h2 className="m-0 mb-5 font-display text-[28px]">
                What to expect
              </h2>
              <ol className="m-0 flex list-none flex-col gap-5.5 p-0">
                {section.steps.map((step, index) => (
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
          );
        }
        return (
          <ol
            key={section.id}
            className="m-0 flex list-none flex-col gap-5.5 p-0"
          >
            {section.steps.map((step, index) => (
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
        );
      case "itemGrid":
        if (variant === "service") {
          return (
            <section key={section.id} className="mb-11">
              <h2 className="m-0 mb-4 font-display text-[28px]">
                Potential treatment indications
              </h2>
              <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 p-0">
                {section.items.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-3 rounded-2xl bg-sand-deep px-4 py-3.5"
                  >
                    <span className="size-[9px] flex-none rounded-full bg-clay" />
                    <span className="text-[14.5px]">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        }
        return (
          <ul
            key={section.id}
            className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 p-0"
          >
            {section.items.map((item) => (
              <li
                key={item}
                className="flex items-center gap-3 rounded-2xl bg-sand-deep px-4 py-3.5"
              >
                <span className="size-[9px] flex-none rounded-full bg-clay" />
                <span className="text-[14.5px]">{item}</span>
              </li>
            ))}
          </ul>
        );
      // ponytail: calloutPanel/image/bulletList render in the ticket-14 build
      case "calloutPanel":
      case "image":
      case "bulletList":
        return null;
    }
  });
}
