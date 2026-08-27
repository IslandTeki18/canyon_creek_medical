import { useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Section } from "../../../convex/lib/content";
import { KICKER, MarketingPage, Placeholder, WRAP } from "./marketing-chrome";

/** Public journal page. The newsletter form remains UI-only. */

const CATEGORIES = [
  "All",
  "Mental health",
  "Addiction medicine",
  "Holistic care",
  "Practice news",
] as const;

export const TAG =
  "self-start rounded-full px-3.25 py-1.5 text-[11.5px] font-bold";
export const TAG_STYLES: Record<string, string> = {
  "Mental health": "bg-primary-tint text-primary-deep",
  "Addiction medicine": "bg-teal-tint text-teal",
};
export const TAG_NEUTRAL = "bg-surface text-ink/72";

/** Post cover image, or a labeled placeholder when the post has none. */
export function PostImage({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className: string;
}) {
  if (!src) return <Placeholder label="post cover" className={className} />;
  return <img src={src} alt={alt} className={`object-cover ${className}`} />;
}

export function readTime(content: Section[] | string) {
  const text =
    typeof content === "string"
      ? content
      : content
          .map((section) => {
            switch (section.type) {
              case "richText":
                return section.text;
              case "numberedSteps":
                return section.steps
                  .map((step) => `${step.title} ${step.body}`)
                  .join(" ");
              case "itemGrid":
              case "bulletList":
                return section.items.join(" ");
              case "calloutPanel":
                return `${section.title ?? ""} ${section.body}`;
              case "image":
                return "";
            }
          })
          .join(" ");
  return Math.max(1, Math.round(text.trim().split(/\s+/).length / 200));
}

function Byline({
  author,
  content,
}: {
  author: string;
  content: Section[] | string;
}) {
  return (
    <span className="text-[12.5px] text-ink/55">
      {author} · {readTime(content)} min read
    </span>
  );
}

export default function BlogPage() {
  const posts = useQuery(api.domains.blog.listPublishedPosts, {});
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const filteredPosts =
    category === "All"
      ? posts
      : posts?.filter((post) => post.category === category);
  const featured = filteredPosts?.[0];
  const remaining = filteredPosts?.slice(1) ?? [];

  return (
    <MarketingPage>
      <header className={`${WRAP} pt-14`}>
        <span className={`${KICKER} mb-3.5`}>Journal</span>
        <h1 className="m-0 max-w-[18ch] font-display text-[clamp(38px,5vw,64px)] leading-[1.05] tracking-[-0.03em]">
          Notes on mind, body &amp;{" "}
          <span className="text-primary">recovery</span>
        </h1>
        <p className="mt-5.5 mb-0 max-w-[56ch] text-[17px] leading-[1.7] text-ink/70">
          Evidence-based perspectives on mental health, addiction medicine and
          whole-person wellness from our team.
        </p>
      </header>

      <div className={`${WRAP} pt-8`}>
        <div className="flex flex-wrap gap-2.5">
          {CATEGORIES.map((c) => (
            <button
              type="button"
              key={c}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={`cursor-pointer rounded-full px-4.5 py-2.25 text-[13px] font-semibold ${
                category === c
                  ? "bg-primary text-white shadow-[0_6px_16px_rgba(33,102,232,.24)]"
                  : "bg-surface text-ink/75 hover:text-primary"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {posts === undefined ? (
        <p role="status" className={`${WRAP} py-16 text-sm text-ink/60`}>
          Loading blog posts…
        </p>
      ) : (
        <>
          {posts.length > 0 && filteredPosts?.length === 0 && (
            <p role="status" className={`${WRAP} py-16 text-sm text-ink/60`}>
              No published posts in {category.toLowerCase()} yet.
            </p>
          )}

          {featured && (
            <section className={`${WRAP} pt-8`}>
              <Link
                to={`/blog/${featured.slug}`}
                className="block text-inherit no-underline"
              >
                <article className="flex flex-wrap items-stretch overflow-hidden rounded-hero bg-surface shadow-panel hover:shadow-[0_16px_48px_rgba(11,37,69,.12)]">
                  <PostImage
                    src={featured.coverImage?.url ?? null}
                    alt={featured.coverImage?.alt ?? ""}
                    className="min-h-[320px] min-w-0 flex-[1_1_420px]"
                  />
                  <div className="flex min-w-0 flex-[1_1_400px] flex-col justify-center p-[clamp(26px,3vw,44px)]">
                    <span
                      className={`${TAG} bg-primary-tint text-primary-deep`}
                    >
                      Featured · {featured.category}
                    </span>
                    <h2 className="mt-4.5 mb-3 font-display text-[clamp(24px,2.8vw,34px)] leading-[1.15]">
                      {featured.title}
                    </h2>
                    <p className="m-0 mb-5 max-w-[46ch] text-[15.5px] leading-[1.7] text-ink/70">
                      {featured.excerpt}
                    </p>
                    <div className="flex items-center gap-3 text-[13px] text-ink/60">
                      <span
                        aria-hidden="true"
                        className="inline-block size-7.5 rounded-full bg-ground-deep"
                      />
                      <span>{featured.authorName}</span>
                      <span>·</span>
                      <span>
                        {readTime(featured.sections ?? featured.body)} min read
                      </span>
                    </div>
                  </div>
                </article>
              </Link>
            </section>
          )}

          {remaining.length > 0 && (
            <section className={`${WRAP} pt-12`}>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6.5">
                {remaining.map((post) => (
                  <Link
                    key={post.slug}
                    to={`/blog/${post.slug}`}
                    className="text-inherit no-underline"
                  >
                    <article className="flex flex-col gap-3.5">
                      <PostImage
                        src={post.coverImage?.url ?? null}
                        alt={post.coverImage?.alt ?? ""}
                        className="aspect-[16/10] w-full rounded-card shadow-card"
                      />
                      <span
                        className={`${TAG} ${TAG_STYLES[post.category] ?? TAG_NEUTRAL}`}
                      >
                        {post.category}
                      </span>
                      <h3 className="m-0 text-[21px] leading-[1.25] font-bold tracking-[-0.02em]">
                        {post.title}
                      </h3>
                      <p className="m-0 text-[14.5px] leading-[1.65] text-ink/70">
                        {post.excerpt}
                      </p>
                      <Byline
                        author={post.authorName}
                        content={post.sections ?? post.body}
                      />
                    </article>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Newsletter */}
      <section className={`${WRAP} pt-16 pb-19`}>
        <div className="rounded-hero bg-surface p-[clamp(32px,4vw,52px)] shadow-panel">
          <h2 className="m-0 mb-3 max-w-[22ch] font-display text-[clamp(24px,2.6vw,32px)] leading-[1.16]">
            Get thoughtful health writing in your inbox
          </h2>
          <p className="mt-0 mb-6 max-w-[48ch] text-[15.5px] leading-[1.7] text-ink/70">
            Occasional notes from our clinicians. No spam — unsubscribe any
            time.
          </p>
          <div className="flex max-w-[480px] flex-wrap gap-3">
            <label htmlFor="newsletter-email" className="sr-only">
              Email address
            </label>
            <input
              id="newsletter-email"
              type="email"
              placeholder="you@example.com"
              className="min-w-0 flex-[1_1_200px] rounded-full border-[1.5px] border-ink/14 bg-field px-5 py-3.5 text-[14.5px] text-ink caret-primary focus-visible:border-primary focus-visible:outline-none"
            />
            <button
              type="button"
              className="cursor-pointer rounded-full bg-primary px-6.5 py-3.5 text-[14.5px] font-semibold text-white shadow-action hover:bg-primary-deep"
            >
              Subscribe
            </button>
          </div>
        </div>
      </section>
    </MarketingPage>
  );
}
