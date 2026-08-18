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

import { inputClass } from "../../components/ui/field";
import { useAuthConfigured } from "../../lib/auth";
import {
  AutosaveBanner,
  AutosaveStatus,
  useAutosave,
  useUnsavedGuard,
} from "./use-autosave";

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
  const createPost = useMutation(api.domains.blog.createPost);
  const generateImageUploadUrl = useMutation(
    api.domains.blog.generateImageUploadUrl,
  );
  const updatePost = useMutation(api.domains.blog.updatePost);
  const saveDraft = useMutation(api.domains.blog.savePostDraft);
  const publishPost = useMutation(api.domains.blog.publishPost);
  const discardDraft = useMutation(api.domains.blog.discardPostDraft);
  const unpublishPost = useMutation(api.domains.blog.unpublishPost);
  const archivePost = useMutation(api.domains.blog.archivePost);
  const restorePost = useMutation(api.domains.blog.restorePost);
  const [selectedId, setSelectedId] = useState<Id<"blogPosts"> | null>(null);
  const [createdId, setCreatedId] = useState<Id<"blogPosts"> | null>(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState<BlogPostContent>(emptyContent);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishIssues, setPublishIssues] = useState<PublishIssue[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const selected = posts?.find((post) => post._id === selectedId);
  const { title, category, excerpt, authorName, sections } = content;
  const body = sections[0]?.type === "richText" ? sections[0].text : "";
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

  function resetEditor() {
    autosave.reset(content, true);
    setSelectedId(null);
    setImageFile(null);
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

  async function uploadImage(file: File) {
    const uploadUrl = await generateImageUploadUrl({});
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!response.ok) throw new Error("Image upload failed");
    return ((await response.json()) as { storageId: Id<"_storage"> }).storageId;
  }

  async function uploadSelectedImage(
    file: File,
    postId: Id<"blogPosts">,
    currentContent: BlogPostContent,
  ) {
    clearMessages();
    setPending("image");
    try {
      const storageId = await uploadImage(file);
      const next = { ...currentContent, imageStorageId: storageId };
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

  async function archive(postId: Id<"blogPosts">) {
    clearMessages();
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
    <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]">
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
          <p role="status" className="mt-3 text-sm text-sage-700">
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
                        <div className="grid size-14 place-items-center rounded bg-sand-deep font-display text-xl">
                          {content.title.charAt(0)}
                        </div>
                      )
                    }
                    primaryAction={
                      post.status === "archived" ? (
                        <button
                          type="button"
                          disabled={pending !== null}
                          onClick={() => void restore(post._id)}
                          className="rounded-full border px-3 py-1 text-sm disabled:opacity-50"
                        >
                          Restore
                        </button>
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
                              className="rounded-full bg-clay px-3 py-1 text-sm text-white disabled:opacity-50"
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
                          {post.status === "published" && (
                            <a
                              href={`/blog/${post.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className={contentCardActionClass}
                            >
                              View as visitor
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
                          <button
                            type="button"
                            disabled={pending !== null}
                            onClick={() => void archive(post._id)}
                            className={contentCardActionClass}
                          >
                            Archive
                          </button>
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

      {selected && (
        <form
          onSubmit={onSave}
          onBlur={() => void autosave.flushNow()}
          className="space-y-4 rounded-lg border p-5"
        >
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-2xl">Edit post</h2>
            <button
              type="button"
              onClick={resetEditor}
              className="rounded-full border px-3 py-1 text-sm"
            >
              Close
            </button>
          </div>
          <AutosaveStatus
            status={autosave.status}
            savedAt={
              autosave.lastSavedAt ??
              selected.draftUpdatedAt ??
              selected.updatedAt
            }
          />
          <p className="rounded border border-clay/40 bg-clay/10 p-3 text-sm">
            Public content — never reference identifiable patients or clinical
            details.
          </p>
          {publishIssues.length > 0 && (
            <div role="alert" className="rounded border border-destructive p-3">
              <p className="font-medium">Fix these items before publishing:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {publishIssues.map((issue) => (
                  <li key={`${issue.path}:${issue.message}`}>
                    <a
                      href={`#post-${
                        issue.path.startsWith("sections.") ? "body" : issue.path
                      }`}
                      className="underline"
                    >
                      {issue.message}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <label className="block text-sm">
            Title
            <input
              id="post-title"
              value={title}
              onChange={(event) =>
                setContent((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              className={inputClass}
            />
          </label>
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
              Lowercase letters, numbers, and hyphens only. Locked after first
              publish.
            </span>
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
            Body
            <textarea
              id="post-body"
              rows={12}
              value={body}
              onChange={(event) =>
                setContent((current) => {
                  const firstSection = current.sections[0];
                  return {
                    ...current,
                    sections:
                      firstSection?.type === "richText"
                        ? [
                            { ...firstSection, text: event.target.value },
                            ...current.sections.slice(1),
                          ]
                        : [
                            {
                              id: "body",
                              type: "richText",
                              text: event.target.value,
                            },
                          ],
                  };
                })
              }
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              Separate paragraphs with a blank line
            </span>
          </label>
          <label className="block text-sm">
            Cover image
            <input
              type="file"
              accept="image/*"
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
                    const { imageStorageId: _imageStorageId, ...next } =
                      content;
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
          {selected.publishedAt === undefined && (
            <button
              type="submit"
              disabled={pending !== null}
              className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {pending === "save" ? "Saving…" : "Save slug"}
            </button>
          )}
        </form>
      )}
    </div>
  );
}
