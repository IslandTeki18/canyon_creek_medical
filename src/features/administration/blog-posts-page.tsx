import { ConvexError } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  CircleAlert,
  CloudCheck,
  Eye,
  ImageUp,
  Plus,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { BlogPostContent } from "../../../convex/lib/content";
import {
  ContentCard,
  contentCardActionClass,
  contentCardDangerActionClass,
  primaryButtonClass,
  secondaryButtonClass,
  StatusPill,
  type ContentState,
} from "../../components/ui/content-card";
import { NameDialog } from "../../components/ui/name-dialog";
import { ReasonDialog } from "../../components/ui/reason-dialog";
import {
  EditorShell,
  RailGroup,
  railLabelClass,
  TopBarDivider,
} from "../../components/ui/editor-shell";
import { fieldLabelClass, inputClass } from "../../components/ui/field";
import {
  SectionCanvas,
  sectionElementId,
  sectionTypeLabel,
} from "../../components/ui/section-canvas";
import { useAuthConfigured } from "../../lib/auth";
import {
  AutosaveBanner,
  AutosaveStatus,
  useAutosave,
  useUnsavedGuard,
} from "./use-autosave";
import { useUploadContentImage } from "./upload-content-image";

const categories = [
  "Mental health",
  "Addiction medicine",
  "Holistic care",
  "Practice news",
] as const;

type Category = (typeof categories)[number];
type PublishIssue = { path: string; message: string };

const filters = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "draft", label: "Drafts" },
  { key: "archived", label: "Archived" },
] as const;
type Filter = (typeof filters)[number]["key"];

function postState(post: {
  status: string;
  draftContent?: unknown;
}): ContentState {
  if (post.status === "archived") return "archived";
  if (post.status === "draft") return "draft";
  return post.draftContent ? "edited" : "live";
}

const shortDate = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

function readMinutes(sections: BlogPostContent["sections"]) {
  const words = sections
    .filter((section) => section.type === "richText")
    .reduce((sum, section) => sum + section.text.split(/\s+/).length, 0);
  return Math.max(1, Math.round(words / 200));
}

function validationIssues(error: unknown): PublishIssue[] | null {
  if (!(error instanceof ConvexError) || typeof error.data !== "object") {
    return null;
  }
  const data = error.data as { code?: unknown; issues?: unknown };
  return data.code === "PUBLISH_VALIDATION_FAILED" && Array.isArray(data.issues)
    ? (data.issues as PublishIssue[])
    : null;
}

function postContent(post: { content?: unknown; draftContent?: unknown }) {
  return (post.draftContent ?? post.content) as BlogPostContent;
}

function emptyContent(): BlogPostContent {
  return {
    title: "",
    category: categories[0],
    excerpt: "",
    authorName: "",
    sections: [{ id: "body", type: "richText", text: "" }],
  };
}

export default function BlogPostsPage() {
  const configured = useAuthConfigured();
  return configured ? (
    <BlogPosts />
  ) : (
    <section>
      <h1 className="text-3xl font-extrabold tracking-[-0.025em]">
        Blog posts
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Authentication is not configured in this environment.
      </p>
    </section>
  );
}

function BlogPosts() {
  const posts = useQuery(api.domains.blog.listPosts, {});
  const createPost = useMutation(api.domains.blog.createPost);
  const uploadImage = useUploadContentImage("blogPost");
  const updatePost = useMutation(api.domains.blog.updatePost);
  const saveDraft = useMutation(api.domains.blog.savePostDraft);
  const publishPost = useMutation(api.domains.blog.publishPost);
  const discardDraft = useMutation(api.domains.blog.discardPostDraft);
  const unpublishPost = useMutation(api.domains.blog.unpublishPost);
  const archivePost = useMutation(api.domains.blog.archivePost);
  const restorePost = useMutation(api.domains.blog.restorePost);
  const deletePost = useMutation(api.domains.blog.deletePost);
  const [selectedId, setSelectedId] = useState<Id<"blogPosts"> | null>(null);
  const [createdId, setCreatedId] = useState<Id<"blogPosts"> | null>(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState<BlogPostContent>(emptyContent);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [coverAlt, setCoverAlt] = useState("");
  const [removeImage, setRemoveImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishIssues, setPublishIssues] = useState<PublishIssue[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const selected = posts?.find((post) => post._id === selectedId);
  const selectedPost = useQuery(
    api.domains.blog.getPost,
    selectedId ? { postId: selectedId } : "skip",
  );
  const { title, category, excerpt, authorName, sections } = content;
  const autosave = useAutosave({
    enabled: selected !== undefined,
    value: content,
    save: (value) =>
      selectedId
        ? saveDraft({ postId: selectedId, content: value })
        : Promise.resolve(),
  });
  const unsavedGuard = useUnsavedGuard(autosave.dirty);
  // Object URL per picked file, not per render; small leak until page unload
  // is acceptable for an admin form.
  const imagePreviewUrl = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : null),
    [imageFile],
  );

  function clearMessages() {
    setError(null);
    setPublishIssues([]);
    setSuccess(null);
  }

  async function previewPost(postId: Id<"blogPosts">) {
    const previewWindow = window.open("", "_blank");
    if (selectedId === postId) await autosave.flushNow();
    const url = `/app/blog/${postId}/preview`;
    if (previewWindow) previewWindow.location.href = url;
    else window.location.assign(url);
  }

  function resetEditor() {
    autosave.reset(content, true);
    setSelectedId(null);
    setImageFile(null);
    setCoverAlt("");
    setRemoveImage(false);
    clearMessages();
  }

  function editPost(post: NonNullable<typeof posts>[number], flush = true) {
    const next = postContent(post);
    autosave.reset(next, flush);
    setSelectedId(post._id);
    setContent(next);
    setSlug(post.slug);
    setImageFile(null);
    setCoverAlt(next.coverImage?.alt ?? "");
    setRemoveImage(false);
    clearMessages();
  }

  useEffect(() => {
    const post = posts?.find((item) => item._id === createdId);
    if (post) {
      const next = postContent(post);
      autosave.reset(next, true);
      setSelectedId(post._id);
      setContent(next);
      setSlug(post.slug);
      setImageFile(null);
      setRemoveImage(false);
      setError(null);
      setPublishIssues([]);
      setSuccess(null);
      setCreatedId(null);
    }
  }, [autosave, createdId, posts]);

  async function uploadSelectedImage(
    file: File,
    postId: Id<"blogPosts">,
    currentContent: BlogPostContent,
  ) {
    clearMessages();
    setPending("image");
    try {
      const storageId = await uploadImage(file);
      const next = {
        ...currentContent,
        coverImage: { storageId, alt: coverAlt },
      };
      if (selectedIdRef.current === postId) {
        setContent(next);
        await autosave.flushNow(next);
      } else {
        await saveDraft({ postId, content: next });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save image");
    } finally {
      setPending(null);
    }
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (selected?.publishedAt !== undefined) {
      void autosave.flushNow();
      return;
    }
    clearMessages();
    setPending("save");
    try {
      await autosave.flushNow();
      await updatePost({ postId: selected._id, slug });
      setSuccess("Slug saved.");
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
      if (action === "publish" && selectedId === postId) {
        await autosave.flushNow();
      }
      if (action === "publish") await publishPost({ postId });
      else await unpublishPost({ postId });
      setSuccess(
        action === "publish" ? "Post published." : "Post unpublished.",
      );
    } catch (err) {
      const issues = validationIssues(err);
      if (action === "publish" && issues) {
        const post = posts?.find((item) => item._id === postId);
        if (post) editPost(post);
        setPublishIssues(issues);
      } else {
        setError(
          err instanceof Error ? err.message : `Could not ${action} post`,
        );
      }
    } finally {
      setPending(null);
    }
  }

  async function discard(postId: Id<"blogPosts">) {
    clearMessages();
    setPending(`discard:${postId}`);
    try {
      await discardDraft({ postId });
      const post = posts?.find((item) => item._id === postId);
      if (post?.content) editPost({ ...post, draftContent: undefined }, false);
      setSuccess("Unpublished changes discarded.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not discard changes",
      );
    } finally {
      setPending(null);
    }
  }

  async function restore(postId: Id<"blogPosts">) {
    clearMessages();
    setPending(`restore:${postId}`);
    try {
      await restorePost({ postId });
      setSuccess("Post restored.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore post");
    } finally {
      setPending(null);
    }
  }

  if (posts === undefined) {
    return (
      <p role="status" className="mt-4 text-sm text-muted-foreground">
        Loading blog posts…
      </p>
    );
  }
  const counts = {
    live: posts.filter((post) => post.status === "published").length,
    draft: posts.filter((post) => post.status === "draft").length,
    archived: posts.filter((post) => post.status === "archived").length,
  };
  const needle = search.trim().toLowerCase();
  const visiblePosts = posts.filter((post) => {
    const state = postState(post);
    if (filter === "all" && state === "archived") return false;
    if (filter === "live" && state !== "live" && state !== "edited") {
      return false;
    }
    if (filter === "draft" && state !== "draft") return false;
    if (filter === "archived" && state !== "archived") return false;
    if (!needle) return true;
    const content = postContent(post);
    return (
      content.title.toLowerCase().includes(needle) ||
      content.excerpt.toLowerCase().includes(needle) ||
      post.slug.includes(needle)
    );
  });

  const messages = (
    <>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <AutosaveBanner
        status={autosave.status}
        savingSince={autosave.savingSince}
        error={autosave.error}
        onCopy={() =>
          void navigator.clipboard.writeText(
            content.sections
              .filter((section) => section.type === "richText")
              .map((section) => section.text)
              .join("\n\n"),
          )
        }
      />
      {success && (
        <p role="status" className="text-sm text-teal">
          {success}
        </p>
      )}
    </>
  );

  if (!selected) {
    return (
      <div className="flex flex-col gap-5.5">
        {unsavedGuard}
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="mb-1.5 text-3xl font-extrabold tracking-[-0.025em]">
              Blog posts
            </h1>
            <p className="text-sm text-ink/60">
              {posts.length} {posts.length === 1 ? "post" : "posts"} ·{" "}
              {counts.live} live, {counts.draft} draft, {counts.archived}{" "}
              archived
            </p>
          </div>
          <NameDialog
            title="New post"
            pathPrefix="/blog/"
            trigger={
              <button
                type="button"
                className={`${primaryButtonClass} min-h-11 px-5 text-sm shadow-[0_8px_22px_rgba(33,102,232,.26)]`}
              >
                <Plus className="size-4" aria-hidden="true" />
                New post
              </button>
            }
            onCreate={(title) => createPost({ title })}
            onCreated={setCreatedId}
          />
        </div>
        {messages}
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex min-h-11 min-w-0 flex-[1_1_260px] items-center gap-2.5 rounded-full border-[1.5px] border-ink/14 bg-field px-4 focus-within:border-primary">
            <Search
              className="size-4 flex-none text-ink/40"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search posts"
              aria-label="Search posts"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={filter === item.key}
              onClick={() => setFilter(item.key)}
              className={`flex min-h-11 items-center rounded-full px-4 text-[13px] font-semibold ${
                filter === item.key
                  ? "bg-primary text-white"
                  : "bg-surface text-ink/75 shadow-card hover:text-primary"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No blog posts yet. Create the first post.
          </p>
        ) : visiblePosts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No posts match this view.
          </p>
        ) : (
          <ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4 p-0">
            {visiblePosts.map((post) => {
              const content = postContent(post);
              const state = postState(post);
              return (
                <li key={post._id}>
                  <ContentCard
                    title={content.title}
                    summary={content.excerpt}
                    chips={[content.category]}
                    path={`/blog/${post.slug}`}
                    state={state}
                    meta={shortDate.format(post.publishedAt ?? post.updatedAt)}
                    media={
                      post.imageUrl ? (
                        <img
                          src={post.imageUrl}
                          alt=""
                          className="size-14 rounded-2xl object-cover"
                        />
                      ) : (
                        <div className="grid size-14 place-items-center rounded-2xl bg-surface-inset text-[22px] font-extrabold text-ink/35">
                          {content.title.charAt(0)}
                        </div>
                      )
                    }
                    primaryAction={
                      post.status === "archived" ? (
                        <>
                          <button
                            type="button"
                            disabled={pending !== null}
                            onClick={() => void restore(post._id)}
                            className={secondaryButtonClass}
                          >
                            Restore
                          </button>
                          <ReasonDialog
                            title="Delete this post permanently?"
                            description="This cannot be undone. The post and its images are removed; the reason is kept for the audit record."
                            confirmLabel="Delete post"
                            trigger={
                              <button
                                type="button"
                                disabled={pending !== null}
                                className={contentCardActionClass}
                              >
                                Delete
                              </button>
                            }
                            onConfirm={async (reason) => {
                              clearMessages();
                              await deletePost({ postId: post._id, reason });
                              setSuccess("Post deleted.");
                            }}
                          />
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => editPost(post)}
                            className={secondaryButtonClass}
                          >
                            Edit
                          </button>
                          {(post.status === "draft" || post.draftContent) && (
                            <button
                              type="button"
                              disabled={pending !== null}
                              onClick={() =>
                                void changeStatus(post._id, "publish")
                              }
                              className={primaryButtonClass}
                            >
                              {post.status === "draft"
                                ? "Put on the website"
                                : "Publish edits"}
                            </button>
                          )}
                        </>
                      )
                    }
                    menuActions={
                      post.status === "archived" ? null : (
                        <>
                          <button
                            type="button"
                            disabled={pending !== null}
                            onClick={() => void previewPost(post._id)}
                            className={contentCardActionClass}
                          >
                            View as visitor
                          </button>
                          {post.status === "published" && (
                            <a
                              href={`/blog/${post.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className={contentCardActionClass}
                            >
                              View live page
                            </a>
                          )}
                          {post.content && post.draftContent && (
                            <button
                              type="button"
                              disabled={pending !== null}
                              onClick={() => void discard(post._id)}
                              className={contentCardActionClass}
                            >
                              Discard edits
                            </button>
                          )}
                          {post.status === "published" && (
                            <button
                              type="button"
                              disabled={pending !== null}
                              onClick={() =>
                                void changeStatus(post._id, "unpublish")
                              }
                              className={contentCardActionClass}
                            >
                              Take off the website
                            </button>
                          )}
                          <ReasonDialog
                            title="Archive this post?"
                            description="Archived posts leave the website and the active list. The reason is kept for the audit record."
                            confirmLabel="Archive post"
                            trigger={
                              <button
                                type="button"
                                disabled={pending !== null}
                                className={contentCardDangerActionClass}
                              >
                                Archive
                              </button>
                            }
                            onConfirm={async (reason) => {
                              clearMessages();
                              await archivePost({ postId: post._id, reason });
                              setSuccess("Post archived.");
                            }}
                          />
                        </>
                      )
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  const editorState = postState(selected);
  return (
    <div className="flex flex-col gap-4">
      {unsavedGuard}
      {messages}
      <form onSubmit={onSave} onBlur={() => void autosave.flushNow()}>
        <EditorShell
          topBar={
            <>
              <button
                type="button"
                onClick={resetEditor}
                className="flex min-h-11 items-center gap-2 text-[13.5px] font-semibold text-ink/60 hover:text-primary"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Posts
              </button>
              <TopBarDivider />
              <div className="flex min-w-0 items-center gap-3">
                <h1 className="m-0 truncate text-[19px] font-extrabold tracking-[-0.02em]">
                  {title || "Untitled post"}
                </h1>
                <StatusPill state={editorState} />
              </div>
              <span className="flex items-center gap-1.75 text-[12.5px] text-ink/55">
                <CloudCheck className="size-3.5 text-teal" aria-hidden="true" />
                <AutosaveStatus
                  status={autosave.status}
                  savedAt={
                    autosave.lastSavedAt ??
                    selected.draftUpdatedAt ??
                    selected.updatedAt
                  }
                />
              </span>
              <div className="ml-auto flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() => void previewPost(selected._id)}
                  className={`${secondaryButtonClass} min-h-11 text-[13.5px]`}
                >
                  <Eye className="size-4" aria-hidden="true" />
                  View as visitor
                </button>
                {selected.status === "draft" || selected.draftContent ? (
                  <button
                    type="button"
                    disabled={pending !== null}
                    onClick={() => void changeStatus(selected._id, "publish")}
                    className={`${primaryButtonClass} min-h-11 px-5.5 text-[13.5px] shadow-[0_8px_22px_rgba(33,102,232,.26)]`}
                  >
                    {selected.status === "draft" ? "Publish" : "Publish edits"}
                  </button>
                ) : null}
                {selected.publishedAt === undefined && (
                  <button
                    type="submit"
                    disabled={pending !== null}
                    className={`${secondaryButtonClass} min-h-11 text-[13.5px]`}
                  >
                    {pending === "save" ? "Saving…" : "Save slug"}
                  </button>
                )}
                <details className="relative">
                  <summary className="grid size-11 cursor-pointer list-none place-items-center rounded-full border-[1.5px] border-ink/14 text-ink/55 hover:border-primary hover:text-primary">
                    <span aria-hidden="true">•••</span>
                    <span className="sr-only">More actions</span>
                  </summary>
                  <div className="absolute right-0 z-10 mt-1 flex min-w-50 flex-col gap-0.5 rounded-2xl bg-surface p-2 shadow-[0_14px_40px_rgba(11,37,69,.2)]">
                    {selected.status === "published" && (
                      <a
                        href={`/blog/${selected.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className={contentCardActionClass}
                      >
                        View live page
                      </a>
                    )}
                    {selected.content && selected.draftContent && (
                      <button
                        type="button"
                        disabled={pending !== null}
                        onClick={() => void discard(selected._id)}
                        className={contentCardActionClass}
                      >
                        Discard edits
                      </button>
                    )}
                    {selected.status === "published" && (
                      <button
                        type="button"
                        disabled={pending !== null}
                        onClick={() =>
                          void changeStatus(selected._id, "unpublish")
                        }
                        className={contentCardActionClass}
                      >
                        Take off the website
                      </button>
                    )}
                  </div>
                </details>
              </div>
            </>
          }
          rail={
            <>
              <div className="flex items-start gap-3 rounded-[20px] bg-teal-tint px-4.5 py-4">
                <ShieldAlert
                  className="mt-px size-[19px] flex-none text-teal"
                  aria-hidden="true"
                />
                <p className="m-0 text-[13px] leading-[1.6] text-ink/78">
                  Public content — never reference identifiable patients or
                  clinical details.
                </p>
              </div>
              {publishIssues.length > 0 && (
                <div
                  role="alert"
                  className="rounded-[20px] bg-surface p-5 shadow-card"
                >
                  <div className="mb-3 flex items-center gap-2.5">
                    <span className="grid size-8.5 flex-none place-items-center rounded-[11px] bg-warn-tint">
                      <CircleAlert
                        className="size-4.5 text-warn-ink"
                        aria-hidden="true"
                      />
                    </span>
                    <p className="m-0 text-[15px] font-bold tracking-[-0.01em]">
                      Fix these before publishing
                    </p>
                  </div>
                  <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                    {publishIssues.map((issue) => {
                      const [root, index] = issue.path.split(".");
                      const section =
                        root === "sections" && index !== undefined
                          ? sections[Number(index)]
                          : undefined;
                      return (
                        <li key={`${issue.path}:${issue.message}`}>
                          <a
                            href={`#${
                              section
                                ? sectionElementId(section.id)
                                : `post-${root}`
                            }`}
                            className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] leading-[1.55] text-ink/78 hover:bg-surface-inset hover:text-primary"
                          >
                            <span
                              aria-hidden="true"
                              className="mt-2 size-1.25 flex-none rounded-full bg-warn-ink"
                            />
                            {section
                              ? `Section ${Number(index) + 1} (${sectionTypeLabel(section.type)}): `
                              : ""}
                            {issue.message}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <RailGroup title="Post details">
                <label className={fieldLabelClass}>
                  Title
                  <input
                    id="post-title"
                    value={title}
                    onChange={(event) => {
                      const value = event.target.value;
                      setContent((current) => ({ ...current, title: value }));
                    }}
                    className={inputClass}
                  />
                </label>
                <label className={fieldLabelClass}>
                  Category
                  <select
                    id="post-category"
                    value={category}
                    onChange={(event) => {
                      const next = event.target.value as Category;
                      const value = { ...content, category: next };
                      setContent(value);
                      void autosave.flushNow(value);
                    }}
                    className={inputClass}
                  >
                    {categories.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className={fieldLabelClass}>
                  Excerpt
                  <textarea
                    id="post-excerpt"
                    maxLength={300}
                    rows={3}
                    value={excerpt}
                    onChange={(event) =>
                      setContent((current) => ({
                        ...current,
                        excerpt: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                  <span className="mt-1.5 flex justify-end text-[11.5px] font-medium text-ink/50">
                    {excerpt.length}/300 characters
                  </span>
                </label>
                <label className={fieldLabelClass}>
                  Author name
                  <input
                    id="post-authorName"
                    value={authorName}
                    onChange={(event) =>
                      setContent((current) => ({
                        ...current,
                        authorName: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </label>
              </RailGroup>
              <RailGroup title="Cover image">
                {(() => {
                  const currentUrl =
                    imagePreviewUrl ??
                    (removeImage ? null : (selected.imageUrl ?? null));
                  return (
                    <label className="grid aspect-video cursor-pointer place-items-center overflow-hidden rounded-2xl bg-placeholder focus-within:ring-[1.5px] focus-within:ring-primary">
                      {currentUrl ? (
                        <img
                          src={currentUrl}
                          alt={
                            imagePreviewUrl
                              ? "Selected cover preview"
                              : "Current cover"
                          }
                          className="size-full object-cover"
                        />
                      ) : (
                        <span className="flex flex-col items-center gap-2 text-ink/55">
                          <ImageUp
                            className="size-5.5 text-ink/40"
                            aria-hidden="true"
                          />
                          <span className="text-[12.5px] font-semibold">
                            Drop an image or browse
                          </span>
                          <span className="text-[11px]">JPG, PNG or WebP</span>
                        </span>
                      )}
                      <input
                        type="file"
                        aria-label="Cover image"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          setImageFile(file);
                          setRemoveImage(false);
                          if (file) {
                            void uploadSelectedImage(
                              file,
                              selected._id,
                              content,
                            );
                          }
                        }}
                        className="sr-only"
                      />
                    </label>
                  );
                })()}
                {selected.imageUrl && !removeImage && !imagePreviewUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setRemoveImage(true);
                      const { coverImage: _coverImage, ...next } = content;
                      setContent(next);
                      void autosave.flushNow(next);
                    }}
                    className={`${secondaryButtonClass} self-start`}
                  >
                    Remove image
                  </button>
                )}
                {removeImage && (
                  <p className="text-xs text-muted-foreground">
                    Image removed from the draft.
                  </p>
                )}
                <label className={fieldLabelClass}>
                  Alt text
                  <input
                    id="post-coverImage"
                    value={coverAlt}
                    onChange={(event) => {
                      const alt = event.target.value;
                      setCoverAlt(alt);
                      setContent((current) =>
                        current.coverImage
                          ? {
                              ...current,
                              coverImage: { ...current.coverImage, alt },
                            }
                          : current,
                      );
                    }}
                    disabled={!content.coverImage && !imageFile}
                    className={`${inputClass} disabled:opacity-60`}
                  />
                </label>
              </RailGroup>
              <RailGroup title="Address">
                <label className={fieldLabelClass}>
                  Slug
                  <span className="mt-1.75 flex min-h-11 items-center overflow-hidden rounded-xl border-[1.5px] border-ink/14 bg-field focus-within:border-primary">
                    <span className="flex-none pl-3.5 text-sm font-normal text-ink/45">
                      /blog/
                    </span>
                    <input
                      required
                      id="post-slug"
                      pattern="[a-z0-9-]+"
                      value={slug}
                      disabled={selected.publishedAt !== undefined}
                      onChange={(event) => setSlug(event.target.value)}
                      className="min-w-0 flex-1 bg-transparent px-1 text-sm font-normal outline-none disabled:opacity-60"
                    />
                  </span>
                  <span className="mt-1.5 block text-[11.5px] leading-[1.55] font-normal text-ink/55">
                    Lowercase letters, numbers, and hyphens only. Locked after
                    first publish.
                  </span>
                </label>
              </RailGroup>
            </>
          }
        >
          <div className="mb-3.5 flex items-center justify-between gap-4 px-1">
            <h3 className={railLabelClass}>Body</h3>
            <span className="text-[12.5px] text-ink/55">
              {sections.length} {sections.length === 1 ? "section" : "sections"}{" "}
              · about {readMinutes(sections)} min read
            </span>
          </div>
          <SectionCanvas
            sections={sections}
            onChange={(next, structural) => {
              const value = { ...content, sections: next };
              setContent(value);
              if (structural) void autosave.flushNow(value);
            }}
            uploadImage={uploadImage}
            imageUrls={selectedPost?.imageUrls}
          />
        </EditorShell>
      </form>
    </div>
  );
}
