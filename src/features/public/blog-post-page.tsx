import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Info } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import { NotFound } from "../../components/app-shell";
import {
  BLUE_PANEL,
  CTA_PRIMARY,
  IconTile,
  MarketingPage,
  WRAP,
} from "./marketing-chrome";
import { PostImage, readTime, TAG, TAG_NEUTRAL, TAG_STYLES } from "./blog-page";
import { getRichTextHeadings } from "./rich-text";
import { renderSections } from "./render-sections";

export { headingId, parseBody } from "./rich-text";

function ShareRow({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const shareButton =
    "cursor-pointer rounded-full border-[1.5px] border-primary/40 bg-transparent px-4 py-2 text-[12.5px] font-semibold text-primary no-underline hover:bg-primary-tint";
  return (
    <div className="mt-9 flex flex-wrap items-center gap-3 border-t border-ink/12 pt-6.5">
      <span className="mr-1 text-[13.5px] text-ink/60">Share</span>
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
      <nav
        aria-label="Breadcrumb"
        className={`${WRAP} pt-7 text-[13.5px] text-ink/60`}
      >
        <Link
          to="/blog"
          className="text-inherit no-underline hover:text-primary"
        >
          Journal
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="font-semibold text-ink">{post.category}</span>
      </nav>

      <header className={`${WRAP} max-w-[900px] pt-6`}>
        <span
          className={`${TAG} inline-flex ${TAG_STYLES[post.category] ?? TAG_NEUTRAL}`}
        >
          {post.category}
        </span>
        <h1 className="mt-5 mb-0 font-display text-[clamp(34px,4.6vw,60px)] leading-[1.06] tracking-[-0.03em]">
          {post.title}
        </h1>
        <p className="mt-5.5 mb-0 text-[18.5px] leading-[1.65] text-ink/70">
          {post.excerpt}
        </p>
        <div className="mt-7.5 flex flex-wrap items-center gap-3.5">
          <span
            aria-hidden="true"
            className="inline-block size-11.5 flex-none rounded-full bg-ground-deep"
          />
          <div className="flex flex-col gap-0.75">
            <span className="text-[14.5px] font-bold">{post.authorName}</span>
            <span className="text-[13px] text-ink/60">
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

      <div className={`${WRAP} pt-9`}>
        <PostImage
          src={post.coverImage?.url ?? null}
          alt={post.coverImage?.alt ?? ""}
          className="aspect-[21/9] w-full rounded-panel shadow-panel"
        />
      </div>

      <div
        className={`${WRAP} flex flex-wrap items-start gap-[clamp(32px,5vw,72px)] pt-13`}
      >
        <article className="min-w-0 max-w-[68ch] flex-[1_1_560px]">
          <div className="flex flex-col gap-8">
            {renderSections(sections, "blog", post.imageUrls)}
          </div>

          <div className="mt-10 grid grid-cols-[40px_minmax(0,1fr)] items-start gap-4 rounded-card bg-teal-tint px-7.5 py-6.5">
            <IconTile as={Info} tone="surface" size={40} />
            <div>
              <h3 className="m-0 mb-1.75 text-lg font-bold tracking-[-0.015em]">
                A note
              </h3>
              <p className="m-0 text-[15px] leading-[1.75] text-ink/78">
                This article is informational and is not a substitute for
                medical advice. If you&rsquo;re in crisis, call or text 988 to
                reach the Suicide &amp; Crisis Lifeline.
              </p>
            </div>
          </div>

          <ShareRow title={post.title} />
        </article>

        <aside className="sticky top-24 hidden min-w-0 flex-[0_1_240px] flex-col gap-3 lg:flex">
          {headings.length > 0 && (
            <>
              <span className="text-[11px] font-bold tracking-[0.08em] text-ink/50 uppercase">
                In this article
              </span>
              {headings.map((heading) => (
                <a
                  key={heading.id}
                  href={`#${heading.id}`}
                  className={`${heading.level === 3 ? "pl-4" : ""} text-sm leading-[1.45] text-ink/75 no-underline hover:text-primary`}
                >
                  {heading.text}
                </a>
              ))}
            </>
          )}
          <Link to="/book" className={`${CTA_PRIMARY} mt-3.5 text-center`}>
            Book an evaluation
          </Link>
        </aside>
      </div>

      {/* Author */}
      <section className="mt-16 bg-surface">
        <div className={`${WRAP} flex flex-wrap items-center gap-7 py-12`}>
          <span
            aria-hidden="true"
            className="inline-block size-26 flex-none rounded-full bg-ground-deep"
          />
          <div className="min-w-0 flex-[1_1_260px]">
            <span className="mb-2 block text-[11px] font-bold tracking-[0.08em] text-primary uppercase">
              Written by
            </span>
            <h2 className="m-0 font-display text-[22px] tracking-[-0.02em]">
              {post.authorName}
            </h2>
          </div>
        </div>
      </section>

      {/* Related */}
      {related.length > 0 && (
        <section className={`${WRAP} pt-16`}>
          <div className="mb-7 flex flex-wrap items-baseline justify-between gap-5">
            <h2 className="m-0 font-display text-[clamp(26px,3vw,34px)]">
              Keep reading
            </h2>
            <Link
              to="/blog"
              className="text-sm font-semibold text-primary no-underline"
            >
              All articles →
            </Link>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
            {related.map((r) => (
              <Link
                key={r.slug}
                to={`/blog/${r.slug}`}
                className="flex flex-col gap-3.25 text-inherit no-underline"
              >
                <PostImage
                  src={r.coverImage?.url ?? null}
                  alt={r.coverImage?.alt ?? ""}
                  className="aspect-[16/10] w-full rounded-card shadow-card"
                />
                <span
                  className={`${TAG} ${TAG_STYLES[r.category] ?? TAG_NEUTRAL}`}
                >
                  {r.category}
                </span>
                <h3 className="m-0 text-xl leading-[1.25] font-bold tracking-[-0.02em]">
                  {r.title}
                </h3>
                <span className="text-[12.5px] text-ink/55">
                  {readTime(r.sections ?? r.body)} min read
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className={`${WRAP} pt-16 pb-19`}>
        <div
          className={`${BLUE_PANEL} flex flex-wrap items-center justify-between gap-7`}
        >
          <div>
            <h2 className="m-0 mb-2.5 font-display text-[clamp(24px,2.6vw,32px)] leading-[1.16]">
              Questions about your care?
            </h2>
            <p className="m-0 max-w-[46ch] text-[15.5px] leading-[1.7] text-white/85">
              Book a comprehensive evaluation and we&rsquo;ll build a plan
              around you.
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

export default function BlogPostPage() {
  const { slug = "" } = useParams();
  const post = useQuery(api.domains.blog.getPublishedPost, { slug });
  const allPosts = useQuery(api.domains.blog.listPublishedPosts, {});

  if (post === undefined) {
    return (
      <MarketingPage>
        <p role="status" className={`${WRAP} py-16 text-sm text-ink/60`}>
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
