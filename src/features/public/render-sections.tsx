import { Check } from "lucide-react";
import type { Section } from "../../../convex/lib/content";
import { KICKER } from "./marketing-chrome";
import { createHeadingIds, parseBody, renderInline } from "./rich-text";

const PARAGRAPH = "mt-0 mb-5 text-[17px] leading-[1.85] text-ink/80";
const CARD = "rounded-card bg-surface shadow-card";

function CheckMark({ size = 22 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="grid flex-none place-items-center rounded-full bg-primary-tint text-primary"
      style={{ width: size, height: size }}
    >
      <Check size={Math.round(size * 0.6)} strokeWidth={3} />
    </span>
  );
}

function CheckList({ items }: { items: readonly string[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2.75 p-0">
      {items.map((item) => (
        <li
          key={item}
          className="flex items-start gap-3 text-[15.5px] leading-[1.6] text-ink/80"
        >
          <span className="mt-0.5 flex">
            <CheckMark size={20} />
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}

function ItemTiles({ items }: { items: readonly string[] }) {
  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3 p-0">
      {items.map((item) => (
        <li
          key={item}
          className="flex items-center gap-3 rounded-2xl bg-surface px-4.5 py-4 shadow-[0_2px_12px_rgba(11,37,69,.04)]"
        >
          <CheckMark />
          <span className="text-[14.5px] font-semibold">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function StepCards({
  steps,
}: {
  steps: readonly { title: string; body: string }[];
}) {
  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0">
      {steps.map((step, index) => (
        <li
          key={step.title}
          className="grid grid-cols-[52px_minmax(0,1fr)] items-start gap-5 rounded-[22px] bg-surface px-6.5 py-6 shadow-[0_2px_14px_rgba(11,37,69,.04)]"
        >
          <span
            aria-hidden="true"
            className="grid size-11 place-items-center rounded-[14px] bg-primary-tint text-[17px] font-extrabold text-primary"
          >
            {index + 1}
          </span>
          <div>
            <h3 className="m-0 mb-1.5 text-lg font-bold tracking-[-0.015em]">
              {step.title}
            </h3>
            <p className="m-0 text-[15px] leading-[1.7] text-ink/70">
              {step.body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

const SECTION_H2 =
  "m-0 mb-4.5 font-display text-[clamp(24px,2.6vw,32px)] leading-[1.2]";

export function renderSections(
  sections: readonly Section[],
  variant: "blog" | "service" = "blog",
  imageUrls: Readonly<Record<string, string>> = {},
) {
  const nextHeadingId = createHeadingIds();
  const richText = (section: Extract<Section, { type: "richText" }>) =>
    parseBody(section.text).map((block, index) =>
      block.kind === "heading" ? (
        <h2
          key={`${section.id}-${index}`}
          id={nextHeadingId(block.text)}
          className="mt-11 mb-3.5 scroll-mt-25 font-display text-[clamp(24px,2.5vw,30px)] leading-[1.2]"
        >
          {renderInline(block.text)}
        </h2>
      ) : block.kind === "subheading" ? (
        <h3
          key={`${section.id}-${index}`}
          id={nextHeadingId(block.text)}
          className="mt-8 mb-3 scroll-mt-25 text-[22px] font-bold tracking-[-0.02em]"
        >
          {renderInline(block.text)}
        </h3>
      ) : block.kind === "quote" ? (
        <figure
          key={`${section.id}-${index}`}
          className={`${CARD} my-8 px-8 py-7`}
        >
          <blockquote className="m-0 text-[22px] leading-[1.4] font-bold tracking-[-0.02em]">
            {renderInline(block.text)}
          </blockquote>
        </figure>
      ) : (
        <p key={`${section.id}-${index}`} className={PARAGRAPH}>
          {renderInline(block.text)}
        </p>
      ),
    );

  return sections.map((section) => {
    switch (section.type) {
      case "richText":
        if (variant === "service") {
          return (
            <section
              key={section.id}
              className="rounded-panel bg-surface p-[clamp(26px,3vw,40px)] shadow-card [&>*:last-child]:mb-0"
            >
              <h2 className={`${KICKER} mb-3`}>How it works</h2>
              {richText(section)}
            </section>
          );
        }
        return (
          <section
            key={section.id}
            className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
          >
            {richText(section)}
          </section>
        );
      case "numberedSteps":
        if (variant === "service") {
          return (
            <section key={section.id}>
              <h2 className={SECTION_H2}>What to expect</h2>
              <StepCards steps={section.steps} />
            </section>
          );
        }
        return <StepCards key={section.id} steps={section.steps} />;
      case "itemGrid":
        if (variant === "service") {
          return (
            <section key={section.id}>
              <h2 className={SECTION_H2}>Conditions we treat</h2>
              <ItemTiles items={section.items} />
            </section>
          );
        }
        return <ItemTiles key={section.id} items={section.items} />;
      case "calloutPanel":
        return (
          <section
            key={section.id}
            className="rounded-card bg-teal-tint px-7.5 py-6.5"
          >
            {section.title && (
              <h3 className="m-0 mb-2 text-lg font-bold tracking-[-0.015em]">
                {section.title}
              </h3>
            )}
            <p className="m-0 text-[15px] leading-[1.75] text-ink/78">
              {section.body}
            </p>
          </section>
        );
      case "bulletList":
        return (
          <div key={section.id} className={`${CARD} px-7.5 py-6.5`}>
            <CheckList items={section.items} />
          </div>
        );
      case "image":
        return imageUrls[section.storageId] ? (
          <img
            key={section.id}
            src={imageUrls[section.storageId]}
            alt={section.alt}
            loading="lazy"
            className="max-h-[420px] w-full rounded-card object-cover shadow-card"
          />
        ) : null;
    }
  });
}
