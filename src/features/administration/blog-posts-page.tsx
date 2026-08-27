import { ConvexError } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { BlogPostContent } from "../../../convex/lib/content";
import {
  ContentCard,
  contentCardActionClass,
} from "../../components/ui/content-card";
import { NameDialog } from "../../components/ui/name-dialog";
import { ReasonDialog } from "../../components/ui/reason-dialog";
import { EditorShell, RailGroup } from "../../components/ui/editor-shell";
import { inputClass } from "../../components/ui/field";
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
  const [showArchived, setShowArchived] = useState(false);

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
  const visiblePosts = posts.filter(
    (post) => showArchived || post.status !== "archived",
  );

  return (
    <div className="mt-6 space-y-8">
      {unsavedGuard}
      <div>
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl">Posts</h2>
          <NameDialog
            title="New post"
            pathPrefix="/blog/"
            trigger={
              <button
                type="button"
                className="rounded-full border px-3 py-1.5 text-sm"
              >
                New post
              </button>
            }
            onCreate={(title) => createPost({ title })}
            onCreated={setCreatedId}
          />
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
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
          <p role="status" className="mt-3 text-sm text-teal">
            {success}
          </p>
        )}
        <label className="mt-4 inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Show archived
        </label>
        {posts.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No blog posts yet. Create the first post.
          </p>
        ) : visiblePosts.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No active blog posts. Show archived to view older posts.
          </p>
        ) : (
          <ul className="mt-4 grid list-none gap-4 sm:grid-cols-2">
            {visiblePosts.map((post) => {
              const content = postContent(post);
              const state =
                post.status === "archived"
                  ? "archived"
                  : post.status === "draft"
                    ? "draft"
                    : post.draftContent
                      ? "edited"
                      : "live";
              return (
                <li key={post._id}>
                  <ContentCard
                    title={content.title}
                    summary={content.excerpt}
                    chips={[content.category]}
                    state={state}
                    media={
                      post.imageUrl ? (
                        <img
                          src={post.imageUrl}
                          alt=""
                          className="size-14 rounded object-cover"
                        />
                      ) : (
                        <div className="grid size-14 place-items-center rounded-xl bg-surface font-display text-xl">
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
                            className="rounded-full border px-3 py-1 text-sm disabled:opacity-50"
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
                              if (selectedId === post._id) resetEditor();
                              setSuccess("Post deleted.");
                            }}
                          />
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => editPost(post)}
                            className="rounded-full border px-3 py-1 text-sm"
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
                              className="rounded-full bg-primary px-3 py-1 text-sm text-white disabled:opacity-50"
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
                                className={contentCardActionClass}
                              >
                                Archive
                              </button>
                            }
                            onConfirm={async (reason) => {
                              clearMessages();
                              await archivePost({ postId: post._id, reason });
                              if (selectedId === post._id) resetEditor();
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

      <form onSubmit={onSave} onBlur={() => void autosave.flushNow()}>
        <EditorShell
          topBar={
            <>
              <button
                type="button"
                onClick={resetEditor}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ← Back
              </button>
              <h2 className="min-w-0 flex-1 truncate font-display text-2xl">
                {title || "Untitled post"}
              </h2>
              {selected && (
                <span className="rounded-full border px-2 py-0.5 text-xs">
                  {selected.status === "draft"
                    ? "Draft"
                    : selected.draftContent
                      ? "Live · edited"
                      : "Live"}
                </span>
              )}
              {selected && (
                <AutosaveStatus
                  status={autosave.status}
                  savedAt={
                    autosave.lastSavedAt ??
                    selected.draftUpdatedAt ??
                    selected.updatedAt
                  }
                />
              )}
              {selected && (
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() => void previewPost(selected._id)}
                  className="text-sm underline disabled:opacity-50"
                >
                  View as visitor
                </button>
              )}
              {selected?.status === "published" && (
                <a
                  href={`/blog/${selected.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm underline"
                >
                  View live page
                </a>
              )}
              {selected?.content && selected.draftContent && (
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() => void discard(selected._id)}
                  className="rounded-full border px-3 py-1 text-sm disabled:opacity-50"
                >
                  Discard
                </button>
              )}
              {selected &&
                (selected.status === "draft" || selected.draftContent) && (
                  <button
                    type="button"
                    disabled={pending !== null}
                    onClick={() => void changeStatus(selected._id, "publish")}
                    className="rounded-full bg-primary px-3 py-1 text-sm text-white disabled:opacity-50"
                  >
                    {selected.status === "draft" ? "Publish" : "Publish edits"}
                  </button>
                )}
              {selected && selected.publishedAt === undefined && (
                <button
                  type="submit"
                  disabled={pending !== null}
                  className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
                >
                  {pending === "save" ? "Saving…" : "Save slug"}
                </button>
              )}
            </>
          }
          rail={
            <>
              <p className="rounded border border-primary/40 bg-primary/10 p-3 text-sm">
                Public content — never reference identifiable patients or
                clinical details.
              </p>
              {publishIssues.length > 0 && (
                <div
                  role="alert"
                  className="rounded border border-destructive p-3"
                >
                  <p className="font-medium">
                    Fix these items before publishing:
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
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
                            className="underline"
                          >
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
                <label className="block text-sm">
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
                <label className="block text-sm">
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
                <label className="block text-sm">
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
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {excerpt.length}/300 characters
                  </span>
                </label>
                <label className="block text-sm">
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
                <label className="block text-sm">
                  Cover image
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setImageFile(file);
                      setRemoveImage(false);
                      if (selected && file) {
                        void uploadSelectedImage(file, selected._id, content);
                      }
                    }}
                    className={inputClass}
                  />
                </label>
                {imagePreviewUrl ? (
                  <img
                    src={imagePreviewUrl}
                    alt="Selected cover preview"
                    className="max-h-40 rounded border object-cover"
                  />
                ) : (
                  selected?.imageUrl &&
                  !removeImage && (
                    <div className="flex items-start gap-3">
                      <img
                        src={selected.imageUrl}
                        alt="Current cover"
                        className="max-h-40 rounded border object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setRemoveImage(true);
                          const { coverImage: _coverImage, ...next } = content;
                          setContent(next);
                          void autosave.flushNow(next);
                        }}
                        className="rounded-full border px-2 py-1 text-xs"
                      >
                        Remove image
                      </button>
                    </div>
                  )
                )}
                {removeImage && (
                  <p className="text-xs text-muted-foreground">
                    Image removed from the draft.
                  </p>
                )}
                <label className="block text-sm">
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
                <label className="block text-sm">
                  Slug
                  <input
                    required
                    id="post-slug"
                    pattern="[a-z0-9-]+"
                    value={slug}
                    disabled={selected?.publishedAt !== undefined}
                    onChange={(event) => setSlug(event.target.value)}
                    className={`${inputClass} disabled:opacity-60`}
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Lowercase letters, numbers, and hyphens only. Locked after
                    first publish.
                  </span>
                </label>
              </RailGroup>
            </>
          }
        >
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
