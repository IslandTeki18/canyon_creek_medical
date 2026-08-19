import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import { NotFound } from "../../components/app-shell";
import { CTA_PRIMARY, MarketingPage, WRAP } from "./marketing-chrome";
import { PostImage, readTime, TAG, TAG_NEUTRAL, TAG_STYLES } from "./blog-page";
import { getRichTextHeadings } from "./rich-text";
import { renderSections } from "./render-sections";

export { headingId, parseBody } from "./rich-text";

function ShareRow({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const shareButton =
    "cursor-pointer rounded-full border border-clay bg-transparent px-2.5 py-0.5 text-[11px] text-clay hover:bg-clay-100";
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-ink/15 pt-6">
      <span className="text-[13.5px] text-ink/70">Share</span>
      <button
        type="button"
        className={shareButton}
        onClick={() => {
          void navigator.clipboard.writeText(window.location.href);
          setCopied(true);
        }}
      >
        {copied ? "Copied" : "Copy link"}
      </button>
      <a
        className={shareButton}
        href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(window.location.href)}`}
      >
        Email
      </a>
      <button type="button" className={shareButton} onClick={() => print()}>
        Print
      </button>
    </div>
  );
}

type Post = NonNullable<
  FunctionReturnType<typeof api.domains.blog.getPublishedPost>
>;
type RelatedPost = FunctionReturnType<
  typeof api.domains.blog.listPublishedPosts
>[number];

export function BlogPostView({
  post,
  related = [],
}: {
  post: Post;
  related?: RelatedPost[];
}) {
  const publishedDate =
    post.publishedAt === undefined
      ? null
      : new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(
          post.publishedAt,
        );
  const sections =
    post.sections ??
    ([{ id: "legacy-body", type: "richText", text: post.body }] as const);
  const headings = getRichTextHeadings(sections);
  return (
    <MarketingPage>
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className={`${WRAP} pt-7 text-[13.5px]`}>
        <Link to="/blog" className="text-ink/70 no-underline hover:text-clay">
          Journal
        </Link>
        <span aria-hidden="true" className="mx-2 text-ink/70">
          /
        </span>
        <span>{post.category}</span>
      </nav>

      <header className={`${WRAP} max-w-[900px] pt-6 pb-8`}>
        <span
          className={`${TAG} inline-flex ${TAG_STYLES[post.category] ?? TAG_NEUTRAL}`}
        >
          {post.category}
        </span>
        <h1 className="mt-4 mb-0 font-display text-[clamp(34px,4.6vw,60px)] leading-[1.06] tracking-[-0.01em]">
          {post.title}
        </h1>
        <p className="mt-5 mb-0 text-lg leading-[1.6] text-ink/80">
          {post.excerpt}
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3.5">
          <span
            aria-hidden="true"
            className="inline-block size-11 flex-none rounded-full bg-sage-200"
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-[14.5px] font-semibold">
              {post.authorName}
            </span>
            <span className="text-[13px] text-ink/70">
              {publishedDate && (
                <>
                  <time dateTime={new Date(post.publishedAt!).toISOString()}>
                    {publishedDate}
                  </time>
                  {" · "}
                </>
              )}
              {readTime(post.sections ?? post.body)} min read
            </span>
          </div>
        </div>
      </header>

      {post.coverImage?.url && (
        <div className={`${WRAP} pb-4`}>
          <img
            src={post.coverImage.url}
            alt={post.coverImage.alt}
            className="aspect-[21/9] w-full rounded-organic object-cover shadow-organic-md"
          />
        </div>
      )}

      <div
        className={`${WRAP} grid items-start gap-[clamp(32px,5vw,72px)] pt-11 pb-16 lg:grid-cols-[minmax(0,1fr)_220px]`}
      >
        <article className="max-w-[68ch]">
          <div className="flex flex-col gap-11">
            {renderSections(sections, "blog", post.imageUrls)}
          </div>

          <div className="mt-9 rounded-organic bg-sand-deep px-7 py-6">
            <h3 className="m-0 mb-2 font-display text-[19px]">A note</h3>
            <p className="m-0 text-[14.5px] leading-[1.7] text-ink/80">
              This article is informational and is not a substitute for medical
              advice. If you&rsquo;re in crisis, call or text 988 to reach the
              Suicide &amp; Crisis Lifeline.
            </p>
          </div>

          <ShareRow title={post.title} />
        </article>

        <aside className="sticky top-6 hidden flex-col gap-2.5 lg:flex">
          {headings.length > 0 && (
            <>
              <span className="text-[11px] font-semibold tracking-[0.06em] text-ink/60 uppercase">
                In this article
              </span>
              {headings.map((heading) => (
                <a
                  key={heading.id}
                  href={`#${heading.id}`}
                  className={`${heading.level === 3 ? "pl-4" : ""} text-sm leading-[1.45] text-inherit no-underline hover:text-clay`}
                >
                  {heading.text}
                </a>
              ))}
            </>
          )}
          <Link to="/book" className={`${CTA_PRIMARY} mt-3 text-center`}>
            Book an evaluation
          </Link>
        </aside>
      </div>

      {/* Author */}
      <section className="bg-sand-deep">
        <div className={`${WRAP} flex flex-wrap items-center gap-6.5 py-12`}>
          <span
            aria-hidden="true"
            className="inline-block size-[110px] flex-none rounded-full bg-sage-200 shadow-organic-sm"
          />
          <div className="min-w-[260px] flex-1">
            <span className="mb-2 block text-[11px] font-semibold tracking-[0.06em] text-clay-700 uppercase">
              Written by
            </span>
            <h2 className="m-0 font-display text-[22px]">{post.authorName}</h2>
          </div>
        </div>
      </section>

      {/* Related */}
      {related.length > 0 && (
        <section className={`${WRAP} pt-14 pb-16`}>
          <div className="mb-6.5 flex flex-wrap items-baseline justify-between gap-5">
            <h2 className="m-0 font-display text-[clamp(26px,3vw,34px)]">
              Keep reading
            </h2>
            <Link
              to="/blog"
              className="text-sm text-clay no-underline hover:underline"
            >
              All articles →
            </Link>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
            {related.map((r) => (
              <Link
                key={r.slug}
                to={`/blog/${r.slug}`}
                className="flex flex-col gap-3 text-inherit no-underline"
              >
                <PostImage
                  src={r.coverImage?.url ?? null}
                  alt={r.coverImage?.alt ?? ""}
                  className="aspect-[16/10] w-full rounded-organic shadow-organic-sm"
                />
                <span
                  className={`${TAG} ${TAG_STYLES[r.category] ?? TAG_NEUTRAL}`}
                >
                  {r.category}
                </span>
                <h3 className="m-0 font-display text-[20px] leading-[1.2]">
                  {r.title}
                </h3>
                <span className="text-[12.5px] text-ink/70">
                  {readTime(r.sections ?? r.body)} min read
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className={`${WRAP} pb-18`}>
        <div className="flex flex-wrap items-center justify-between gap-6.5 rounded-organic bg-sage-100 p-[clamp(32px,4vw,52px)]">
          <div>
            <h2 className="m-0 mb-2 font-display text-[clamp(24px,2.6vw,32px)]">
              Questions about your care?
            </h2>
            <p className="m-0 max-w-[46ch] text-[15.5px] text-ink/80">
              Book a comprehensive evaluation and we&rsquo;ll build a plan
              around you.
            </p>
          </div>
          <Link to="/book" className={CTA_PRIMARY}>
            Book an appointment
          </Link>
        </div>
      </section>
    </MarketingPage>
  );
}

export default function BlogPostPage() {
  const { slug = "" } = useParams();
  const post = useQuery(api.domains.blog.getPublishedPost, { slug });
  const allPosts = useQuery(api.domains.blog.listPublishedPosts, {});

  if (post === undefined) {
    return (
      <MarketingPage>
        <p role="status" className={`${WRAP} py-16 text-sm text-ink/70`}>
          Loading blog post…
        </p>
      </MarketingPage>
    );
  }
  if (post === null) return <NotFound />;
  const related =
    allPosts?.filter((item) => item.slug !== post.slug).slice(0, 3) ?? [];
  return <BlogPostView post={post} related={related} />;
}
