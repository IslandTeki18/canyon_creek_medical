import { useQuery } from "convex/react";
import { Link, useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import { NotFound } from "../../components/app-shell";
import { MarketingPage, WRAP } from "./marketing-chrome";

function readTime(body: string) {
  return Math.max(1, Math.round(body.trim().split(/\s+/).length / 200));
}

export default function BlogPostPage() {
  const { slug = "" } = useParams();
  const post = useQuery(api.domains.blog.getPublishedPost, { slug });

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

  const publishedDate =
    post.publishedAt === undefined
      ? null
      : new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(
          post.publishedAt,
        );

  return (
    <MarketingPage>
      <article className={`${WRAP} pt-12 pb-18`}>
        <Link
          to="/blog"
          className="text-[13.5px] text-ink/70 no-underline hover:text-clay"
        >
          ← Back to journal
        </Link>

        <header className="pt-7 pb-10">
          <span className="inline-flex rounded-full bg-clay-100 px-2.5 py-0.5 text-[11px] text-clay-800">
            {post.category}
          </span>
          <h1 className="mt-4 mb-0 max-w-[18ch] font-display text-[clamp(38px,5vw,66px)] leading-[1.04] tracking-[-0.01em]">
            {post.title}
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-[13.5px] text-ink/70">
            <span>{post.authorName}</span>
            {publishedDate && (
              <>
                <span>·</span>
                <time dateTime={new Date(post.publishedAt!).toISOString()}>
                  {publishedDate}
                </time>
              </>
            )}
            <span>·</span>
            <span>{readTime(post.body)} min read</span>
          </div>
        </header>

        <div className="max-w-[70ch]">
          {post.body.split(/\n\s*\n/).map((paragraph, index) => (
            <p
              key={index}
              className="mt-0 mb-5 text-base leading-[1.75] text-ink/85 last:mb-0"
            >
              {paragraph}
            </p>
          ))}
        </div>
      </article>
    </MarketingPage>
  );
}
