import { useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Section } from "../../../convex/lib/content";
import { HeaderBlob, KICKER, MarketingPage, WRAP } from "./marketing-chrome";

/** Public journal page. The newsletter form remains UI-only. */

const CATEGORIES = [
  "All",
  "Mental health",
  "Addiction medicine",
  "Holistic care",
  "Practice news",
] as const;

export const TAG = "self-start rounded-full px-2.5 py-0.5 text-[11px]";
export const TAG_STYLES: Record<string, string> = {
  "Mental health": "bg-clay-100 text-clay-800",
  "Addiction medicine": "bg-sage-100 text-sage-800",
};
export const TAG_NEUTRAL = "bg-sand-deep text-ink/80";

/** Post cover image, or a sage-tinted stand-in when the post has none. */
export function PostImage({
  src,
  className,
}: {
  src: string | null;
  className: string;
}) {
  if (!src) {
    return <div aria-hidden="true" className={`bg-sage-200 ${className}`} />;
  }
  return <img src={src} alt="" className={`object-cover ${className}`} />;
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
    <div className="mt-0.5 flex items-center gap-2 text-[12.5px] text-ink/70">
      <span>{author}</span>
      <span>·</span>
      <span>{readTime(content)} min read</span>
    </div>
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
      <header className="relative">
        <HeaderBlob size={400} />
        <div className={`${WRAP} relative z-10 pt-14 pb-9`}>
          <span className={`${KICKER} mb-4`}>Journal</span>
          <h1 className="m-0 max-w-[16ch] font-display text-[clamp(38px,5vw,64px)] leading-[1.05] tracking-[-0.01em]">
            Notes on mind, body &amp; recovery
          </h1>
          <p className="mt-5.5 mb-0 max-w-[56ch] text-[17px] leading-[1.65] text-ink/80">
            Evidence-based perspectives on mental health, addiction medicine and
            whole-person wellness from our team.
          </p>
        </div>
      </header>

      <div className={`${WRAP} pb-7`}>
        <div className="flex flex-wrap gap-2.5">
          {CATEGORIES.map((c) => (
            <button
              type="button"
              key={c}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-3.5 py-1.5 text-[11px] ${
                category === c ? "bg-clay-100 text-clay-800" : TAG_NEUTRAL
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {posts === undefined ? (
        <p role="status" className={`${WRAP} pb-16 text-sm text-ink/70`}>
          Loading blog posts…
        </p>
      ) : (
        <>
          {posts.length > 0 && filteredPosts?.length === 0 && (
            <p role="status" className={`${WRAP} pb-16 text-sm text-ink/70`}>
              No published posts in {category.toLowerCase()} yet.
            </p>
          )}

          {featured && (
            <section className={`${WRAP} pb-11`}>
              <Link
                to={`/blog/${featured.slug}`}
                className="block text-inherit no-underline"
              >
                <article className="grid items-center gap-[clamp(24px,4vw,48px)] overflow-hidden rounded-organic bg-sand-deep md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                  <PostImage
                    src={featured.imageUrl}
                    className="h-full min-h-[300px] w-full"
                  />
                  <div className="p-[clamp(24px,3vw,44px)] md:pl-0">
                    <span
                      className={`${TAG} inline-flex bg-clay-100 text-clay-800`}
                    >
                      Featured · {featured.category}
                    </span>
                    <h2 className="mt-3.5 mb-3 font-display text-[clamp(24px,2.8vw,34px)] leading-[1.15]">
                      {featured.title}
                    </h2>
                    <p className="m-0 mb-4 max-w-[46ch] text-[15px] leading-[1.65] text-ink/80">
                      {featured.excerpt}
                    </p>
                    <div className="flex items-center gap-2.5 text-[13px] text-ink/70">
                      <span className="inline-block size-7 rounded-full bg-sage-200" />
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
            <section className={`${WRAP} pb-16`}>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6.5">
                {remaining.map((post) => (
                  <Link
                    key={post.slug}
                    to={`/blog/${post.slug}`}
                    className="text-inherit no-underline"
                  >
                    <article className="flex flex-col gap-3.5">
                      <PostImage
                        src={post.imageUrl}
                        className="aspect-[16/10] w-full rounded-organic shadow-organic-sm"
                      />
                      <span
                        className={`${TAG} ${TAG_STYLES[post.category] ?? TAG_NEUTRAL}`}
                      >
                        {post.category}
                      </span>
                      <h3 className="m-0 font-display text-[21px] leading-[1.2]">
                        {post.title}
                      </h3>
                      <p className="m-0 text-sm leading-[1.6] text-ink/80">
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
      <section className={`${WRAP} pb-18`}>
        <div className="rounded-organic bg-sage-100 p-[clamp(32px,4vw,52px)]">
          <h2 className="m-0 mb-2.5 max-w-[22ch] font-display text-[clamp(24px,2.6vw,32px)]">
            Get thoughtful health writing in your inbox
          </h2>
          <p className="mt-0 mb-5.5 max-w-[48ch] text-[15.5px] text-ink/80">
            Occasional notes from our clinicians. No spam — unsubscribe any
            time.
          </p>
          <div className="flex max-w-[460px] flex-wrap gap-3">
            <label htmlFor="newsletter-email" className="sr-only">
              Email address
            </label>
            <input
              id="newsletter-email"
              type="email"
              placeholder="you@example.com"
              className="min-w-[200px] flex-1 rounded-full border border-ink/15 bg-sand px-3.5 py-2 text-sm text-ink caret-clay hover:border-ink/45 focus-visible:border-clay focus-visible:outline-none"
            />
            <button
              type="button"
              className="cursor-pointer rounded-full bg-clay px-5.5 py-2.5 font-display text-sm text-sand hover:bg-clay-600"
            >
              Subscribe
            </button>
          </div>
        </div>
      </section>
    </MarketingPage>
  );
}
