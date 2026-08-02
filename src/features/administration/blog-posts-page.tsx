import { useMutation, useQuery } from "convex/react";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuthConfigured } from "../../lib/auth";

const categories = [
  "Mental health",
  "Addiction medicine",
  "Holistic care",
  "Practice news",
] as const;

type Category = (typeof categories)[number];

const inputClass = "mt-1 block w-full rounded border bg-card px-3 py-2";

function slugify(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function BlogPostsPage() {
  const configured = useAuthConfigured();
  return (
    <section>
      <h1 className="font-display text-3xl">Blog posts</h1>
      {configured ? (
        <BlogPosts />
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Authentication is not configured in this environment.
        </p>
      )}
    </section>
  );
}

function BlogPosts() {
  const posts = useQuery(api.domains.blog.listPosts, {});
  const currentUser = useQuery(api.domains.users.currentUser);
  const createPost = useMutation(api.domains.blog.createPost);
  const updatePost = useMutation(api.domains.blog.updatePost);
  const publishPost = useMutation(api.domains.blog.publishPost);
  const unpublishPost = useMutation(api.domains.blog.unpublishPost);
  const archivePost = useMutation(api.domains.blog.archivePost);
  const [selectedId, setSelectedId] = useState<Id<"blogPosts"> | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [category, setCategory] = useState<Category>(categories[0]);
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser) setAuthorName((name) => name || currentUser.displayName);
  }, [currentUser]);

  const selected = posts?.find((post) => post._id === selectedId);

  function clearMessages() {
    setError(null);
    setSuccess(null);
  }

  function resetEditor() {
    setSelectedId(null);
    setTitle("");
    setSlug("");
    setSlugEdited(false);
    setCategory(categories[0]);
    setExcerpt("");
    setBody("");
    setAuthorName(currentUser?.displayName ?? "");
    clearMessages();
  }

  function editPost(post: NonNullable<typeof posts>[number]) {
    setSelectedId(post._id);
    setTitle(post.title);
    setSlug(post.slug);
    setSlugEdited(true);
    setCategory(post.category);
    setExcerpt(post.excerpt);
    setBody(post.body);
    setAuthorName(post.authorName);
    clearMessages();
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    clearMessages();
    setPending("save");
    try {
      const fields = { title, category, excerpt, body, authorName };
      if (selected) {
        await updatePost({
          postId: selected._id,
          ...fields,
          ...(selected.status === "published" ? {} : { slug }),
        });
        setSuccess("Post saved.");
      } else {
        await createPost({ slug, ...fields });
        resetEditor();
        setSuccess("Post created.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save post");
    } finally {
      setPending(null);
    }
  }

  async function changeStatus(
    postId: Id<"blogPosts">,
    action: "publish" | "unpublish",
  ) {
    clearMessages();
    setPending(`${action}:${postId}`);
    try {
      if (action === "publish") await publishPost({ postId });
      else await unpublishPost({ postId });
      setSuccess(
        action === "publish" ? "Post published." : "Post unpublished.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not ${action} post`);
    } finally {
      setPending(null);
    }
  }

  async function archive(postId: Id<"blogPosts">) {
    const reason = window.prompt("Reason for archiving?")?.trim();
    if (!reason) {
      setError("Archive reason is required.");
      return;
    }
    clearMessages();
    setPending(`archive:${postId}`);
    try {
      await archivePost({ postId, reason });
      if (selectedId === postId) resetEditor();
      setSuccess("Post archived.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not archive post");
    } finally {
      setPending(null);
    }
  }

  if (posts === undefined || currentUser === undefined) {
    return (
      <p role="status" className="mt-4 text-sm text-muted-foreground">
        Loading blog posts…
      </p>
    );
  }

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]">
      <div>
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl">Posts</h2>
          <button
            type="button"
            onClick={resetEditor}
            className="rounded-full border px-3 py-1.5 text-sm"
          >
            New post
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="mt-3 text-sm text-sage-700">
            {success}
          </p>
        )}
        {posts.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No blog posts yet. Create the first post.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">Post</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr key={post._id} className="border-b align-top">
                    <td className="py-3 pr-3">
                      <span className="block font-medium">{post.title}</span>
                      <span className="text-xs text-muted-foreground">
                        By {post.authorName}
                      </span>
                    </td>
                    <td className="py-3 pr-3">{post.category}</td>
                    <td className="py-3 pr-3">
                      <span className="rounded-full border px-2 py-0.5 text-xs capitalize">
                        {post.status}
                      </span>
                    </td>
                    <td className="py-3 pr-3">
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                      }).format(post.updatedAt)}
                    </td>
                    <td className="py-3">
                      {post.status !== "archived" && (
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => editPost(post)}
                            className="rounded-full border px-2 py-1 text-xs"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={pending !== null}
                            onClick={() =>
                              void changeStatus(
                                post._id,
                                post.status === "published"
                                  ? "unpublish"
                                  : "publish",
                              )
                            }
                            className="rounded-full border px-2 py-1 text-xs disabled:opacity-50"
                          >
                            {pending === `publish:${post._id}`
                              ? "Publishing…"
                              : pending === `unpublish:${post._id}`
                                ? "Unpublishing…"
                                : post.status === "published"
                                  ? "Unpublish"
                                  : "Publish"}
                          </button>
                          <button
                            type="button"
                            disabled={pending !== null}
                            onClick={() => void archive(post._id)}
                            className="rounded-full border px-2 py-1 text-xs disabled:opacity-50"
                          >
                            {pending === `archive:${post._id}`
                              ? "Archiving…"
                              : "Archive"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <form onSubmit={onSave} className="space-y-4 rounded-lg border p-5">
        <h2 className="font-display text-2xl">
          {selected ? "Edit post" : "New post"}
        </h2>
        <p className="rounded border border-clay/40 bg-clay/10 p-3 text-sm">
          Public content — never reference identifiable patients or clinical
          details.
        </p>
        {selected?.status === "published" && (
          <p role="status" className="rounded border border-clay p-3 text-sm">
            Changes go live on save.
          </p>
        )}
        <label className="block text-sm">
          Title
          <input
            required
            value={title}
            onChange={(event) => {
              const value = event.target.value;
              setTitle(value);
              if (!selected && !slugEdited) setSlug(slugify(value));
            }}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          Slug
          <input
            required
            pattern="[a-z0-9-]+"
            value={slug}
            disabled={selected?.status === "published"}
            onChange={(event) => {
              setSlug(event.target.value);
              setSlugEdited(true);
            }}
            className={`${inputClass} disabled:opacity-60`}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Lowercase letters, numbers, and hyphens only. Locked while
            published.
          </span>
        </label>
        <label className="block text-sm">
          Category
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as Category)}
            className={inputClass}
          >
            {categories.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Excerpt
          <textarea
            required
            maxLength={300}
            rows={3}
            value={excerpt}
            onChange={(event) => setExcerpt(event.target.value)}
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            {excerpt.length}/300 characters
          </span>
        </label>
        <label className="block text-sm">
          Body
          <textarea
            required
            rows={12}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Separate paragraphs with a blank line
          </span>
        </label>
        <label className="block text-sm">
          Author name
          <input
            required
            value={authorName}
            onChange={(event) => setAuthorName(event.target.value)}
            className={inputClass}
          />
        </label>
        <button
          type="submit"
          disabled={pending !== null}
          className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {pending === "save"
            ? "Saving…"
            : selected
              ? "Save changes"
              : "Create post"}
        </button>
      </form>
    </div>
  );
}
