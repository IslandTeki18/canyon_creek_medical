import { useQuery } from "convex/react";
import { Link, useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { NotFound } from "../../components/app-shell";
import { BlogPostView } from "../public/blog-post-page";
import { MarketingPage, WRAP } from "../public/marketing-chrome";
import { toPostPreview } from "./preview-payload";

export default function BlogPostPreviewPage() {
  const { postId } = useParams();
  const post = useQuery(
    api.domains.blog.getPost,
    postId ? { postId: postId as Id<"blogPosts"> } : "skip",
  );
  if (!postId || post === null) return <NotFound />;
  if (post === undefined) {
    return (
      <MarketingPage>
        <p role="status" className={`${WRAP} py-16 text-ink/70`}>
          Loading preview…
        </p>
      </MarketingPage>
    );
  }
  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 bg-ink px-4 py-2 text-center text-sm text-white shadow">
        Preview of unpublished draft ·{" "}
        <Link to="/app/blog" className="underline">
          Back to editor
        </Link>
      </div>
      <BlogPostView post={toPostPreview(post)} />
    </>
  );
}
