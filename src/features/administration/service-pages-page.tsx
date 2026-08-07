import { ConvexError } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ServicePageContent } from "../../../convex/lib/content";
import { useAuthConfigured } from "../../lib/auth";

const inputClass = "mt-1 block w-full rounded border bg-card px-3 py-2";
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

function emptyContent(): ServicePageContent {
  return {
    title: "",
    icon: "brain",
    summary: "",
    chips: [],
    tags: [],
    intro: "",
    howItWorks: [""],
    indications: [],
    steps: [{ title: "", body: "" }],
    facts: [],
    safetyNote: "",
  };
}

export default function ServicePagesPage() {
  const configured = useAuthConfigured();
  return (
    <section>
      <h1 className="font-display text-3xl">Service pages (website)</h1>
      {configured ? (
        <ServicePages />
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Authentication is not configured in this environment.
        </p>
      )}
    </section>
  );
}

function ServicePages() {
  const pages = useQuery(api.domains.content.listServicePages, {});
  const createPage = useMutation(api.domains.content.createServicePage);
  const updatePage = useMutation(api.domains.content.updateServicePage);
  const publishPage = useMutation(api.domains.content.publishServicePage);
  const discardDraft = useMutation(api.domains.content.discardServicePageDraft);
  const unpublishPage = useMutation(api.domains.content.unpublishServicePage);
  const archivePage = useMutation(api.domains.content.archiveServicePage);
  const [selectedId, setSelectedId] = useState<Id<"servicePages"> | null>(null);
  const [slug, setSlug] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [content, setContent] = useState<ServicePageContent>(emptyContent);
  const [error, setError] = useState<string | null>(null);
  const [publishIssues, setPublishIssues] = useState<PublishIssue[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const selected = pages?.find((page) => page._id === selectedId);

  function clearMessages() {
    setError(null);
    setPublishIssues([]);
    setSuccess(null);
  }

  function resetEditor() {
    setSelectedId(null);
    setSlug("");
    setSortOrder(0);
    setContent(emptyContent());
    clearMessages();
  }

  function editPage(page: NonNullable<typeof pages>[number]) {
    setSelectedId(page._id);
    setSlug(page.slug);
    setSortOrder(page.sortOrder);
    setContent((page.draftContent ?? page.content) as ServicePageContent);
    clearMessages();
  }

  function field<K extends keyof ServicePageContent>(
    key: K,
    value: ServicePageContent[K],
  ) {
    setContent((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    clearMessages();
    setPending("save");
    try {
      if (selected) {
        await updatePage({
          servicePageId: selected._id,
          sortOrder,
          content,
        });
        setSuccess("Service page saved.");
      } else {
        await createPage({ slug, sortOrder, content });
        resetEditor();
        setSuccess("Service page created.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save page");
    } finally {
      setPending(null);
    }
  }

  async function changeStatus(
    servicePageId: Id<"servicePages">,
    action: "publish" | "unpublish",
  ) {
    clearMessages();
    setPending(`${action}:${servicePageId}`);
    try {
      if (action === "publish") await publishPage({ servicePageId });
      else await unpublishPage({ servicePageId });
      setSuccess(
        action === "publish"
          ? "Service page published."
          : "Service page unpublished.",
      );
    } catch (err) {
      const issues = validationIssues(err);
      if (action === "publish" && issues) {
        const page = pages?.find((item) => item._id === servicePageId);
        if (page) editPage(page);
        setPublishIssues(issues);
      } else {
        setError(
          err instanceof Error ? err.message : `Could not ${action} page`,
        );
      }
    } finally {
      setPending(null);
    }
  }

  async function archive(servicePageId: Id<"servicePages">) {
    clearMessages();
    const reason = window.prompt("Reason for archiving?")?.trim();
    if (!reason) {
      setError("Archive reason is required.");
      return;
    }
    setPending(`archive:${servicePageId}`);
    try {
      await archivePage({ servicePageId, reason });
      if (selectedId === servicePageId) resetEditor();
      setSuccess("Service page archived.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not archive page");
    } finally {
      setPending(null);
    }
  }

  async function discard(servicePageId: Id<"servicePages">) {
    clearMessages();
    setPending(`discard:${servicePageId}`);
    try {
      await discardDraft({ servicePageId });
      const page = pages?.find((item) => item._id === servicePageId);
      if (page?.content) setContent(page.content as ServicePageContent);
      setSuccess("Unpublished changes discarded.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not discard changes",
      );
    } finally {
      setPending(null);
    }
  }

  if (pages === undefined) {
    return (
      <p role="status" className="mt-4 text-sm text-muted-foreground">
        Loading service pages…
      </p>
    );
  }

  return (
    <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,32rem)]">
      <div>
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl">Pages</h2>
          <button
            type="button"
            onClick={resetEditor}
            className="rounded-full border px-3 py-1.5 text-sm"
          >
            New page
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
        {pages.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No service pages yet. Create the first page.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">Page</th>
                  <th>Slug</th>
                  <th>Status</th>
                  <th>Order</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pages.map((page) => (
                  <tr key={page._id} className="border-b align-top">
                    <td className="py-3 pr-3 font-medium">
                      {
                        (
                          (page.draftContent ??
                            page.content) as ServicePageContent
                        ).title
                      }
                    </td>
                    <td className="py-3 pr-3">{page.slug}</td>
                    <td className="py-3 pr-3">
                      <span className="rounded-full border px-2 py-0.5 text-xs capitalize">
                        {page.status === "published" && page.draftContent
                          ? "Published, unpublished changes"
                          : page.status}
                      </span>
                    </td>
                    <td className="py-3 pr-3">{page.sortOrder}</td>
                    <td className="py-3">
                      {page.status !== "archived" && (
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => editPage(page)}
                            className="rounded-full border px-2 py-1 text-xs"
                          >
                            Edit
                          </button>
                          {page.content && page.draftContent && (
                            <button
                              type="button"
                              disabled={pending !== null}
                              onClick={() => void discard(page._id)}
                              className="rounded-full border px-2 py-1 text-xs disabled:opacity-50"
                            >
                              {pending === `discard:${page._id}`
                                ? "Discarding…"
                                : "Discard changes"}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={pending !== null}
                            onClick={() =>
                              void changeStatus(
                                page._id,
                                page.status === "published"
                                  ? "unpublish"
                                  : "publish",
                              )
                            }
                            className="rounded-full border px-2 py-1 text-xs disabled:opacity-50"
                          >
                            {pending === `publish:${page._id}`
                              ? "Publishing…"
                              : pending === `unpublish:${page._id}`
                                ? "Unpublishing…"
                                : page.status === "published"
                                  ? "Unpublish"
                                  : "Publish"}
                          </button>
                          <button
                            type="button"
                            disabled={pending !== null}
                            onClick={() => void archive(page._id)}
                            className="rounded-full border px-2 py-1 text-xs disabled:opacity-50"
                          >
                            {pending === `archive:${page._id}`
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

      <form onSubmit={save} className="space-y-4 rounded-lg border p-5">
        <h2 className="font-display text-2xl">
          {selected ? "Edit page" : "New page"}
        </h2>
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
                    href={`#service-${issue.path.split(".")[0]}`}
                    className="underline"
                  >
                    {issue.message}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        <TextField
          id="service-title"
          label="Title"
          value={content.title}
          onChange={(value) => field("title", value)}
        />
        <TextField
          id="service-slug"
          label="Slug"
          value={slug}
          onChange={setSlug}
          pattern="[a-z0-9-]+"
          disabled={selected !== undefined}
          required
        />
        <TextField
          id="service-icon"
          label="Icon key"
          value={content.icon}
          onChange={(value) => field("icon", value)}
        />
        <label className="block text-sm">
          Sort order
          <input
            required
            type="number"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.valueAsNumber)}
            className={inputClass}
          />
        </label>
        <TextArea
          id="service-summary"
          label="Summary"
          value={content.summary}
          onChange={(value) => field("summary", value)}
          rows={3}
        />
        <div id="service-chips">
          <StringRows
            label="Chips"
            values={content.chips}
            onChange={(values) => field("chips", values)}
          />
        </div>
        <div id="service-tags">
          <TagRows
            values={content.tags}
            onChange={(values) => field("tags", values)}
          />
        </div>
        <TextArea
          id="service-intro"
          label="Introduction"
          value={content.intro}
          onChange={(value) => field("intro", value)}
          rows={5}
        />
        <div id="service-howItWorks">
          <StringRows
            label="How it works"
            values={content.howItWorks}
            onChange={(values) => field("howItWorks", values)}
            multiline
          />
        </div>
        <div id="service-indications">
          <StringRows
            label="Indications"
            values={content.indications}
            onChange={(values) => field("indications", values)}
          />
        </div>
        <div id="service-steps">
          <StepRows
            values={content.steps}
            onChange={(values) => field("steps", values)}
          />
        </div>
        <div id="service-facts">
          <FactRows
            values={content.facts}
            onChange={(values) => field("facts", values)}
          />
        </div>
        <TextArea
          id="service-safetyNote"
          label="Safety note"
          value={content.safetyNote}
          onChange={(value) => field("safetyNote", value)}
          rows={4}
        />
        <button
          type="submit"
          disabled={pending !== null}
          className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {pending === "save"
            ? "Saving…"
            : selected
              ? "Save changes"
              : "Create page"}
        </button>
      </form>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  required = false,
  ...props
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  pattern?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} disabled:opacity-60`}
        {...props}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows,
  id,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  id?: string;
}) {
  return (
    <label className="block text-sm">
      {label}
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </label>
  );
}

function StringRows({
  label,
  values,
  onChange,
  multiline = false,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  multiline?: boolean;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      {values.map((value, index) => (
        <div key={index} className="flex gap-2">
          {multiline ? (
            <textarea
              value={value}
              onChange={(event) =>
                onChange(
                  values.map((item, i) =>
                    i === index ? event.target.value : item,
                  ),
                )
              }
              className={inputClass}
            />
          ) : (
            <input
              value={value}
              onChange={(event) =>
                onChange(
                  values.map((item, i) =>
                    i === index ? event.target.value : item,
                  ),
                )
              }
              className={inputClass}
            />
          )}
          <Remove
            onClick={() => onChange(values.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <Add onClick={() => onChange([...values, ""])} />
    </fieldset>
  );
}

function TagRows({
  values,
  onChange,
}: {
  values: ServicePageContent["tags"];
  onChange: (values: ServicePageContent["tags"]) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Tags</legend>
      {values.map((tag, index) => (
        <div key={index} className="flex items-end gap-2">
          <TextField
            label="Label"
            value={tag.label}
            onChange={(label) =>
              onChange(
                values.map((item, i) =>
                  i === index ? { ...item, label } : item,
                ),
              )
            }
          />
          <label className="pb-2 text-sm">
            <input
              type="checkbox"
              checked={tag.accent ?? false}
              onChange={(event) =>
                onChange(
                  values.map((item, i) =>
                    i === index
                      ? { ...item, accent: event.target.checked || undefined }
                      : item,
                  ),
                )
              }
            />{" "}
            Accent
          </label>
          <Remove
            onClick={() => onChange(values.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <Add onClick={() => onChange([...values, { label: "" }])} />
    </fieldset>
  );
}

function StepRows({
  values,
  onChange,
}: {
  values: ServicePageContent["steps"];
  onChange: (values: ServicePageContent["steps"]) => void;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Steps</legend>
      {values.map((step, index) => (
        <div key={index} className="rounded border p-3">
          <TextField
            label="Title"
            value={step.title}
            onChange={(title) =>
              onChange(
                values.map((item, i) =>
                  i === index ? { ...item, title } : item,
                ),
              )
            }
          />
          <TextArea
            label="Body"
            rows={3}
            value={step.body}
            onChange={(body) =>
              onChange(
                values.map((item, i) =>
                  i === index ? { ...item, body } : item,
                ),
              )
            }
          />
          <Remove
            onClick={() => onChange(values.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <Add onClick={() => onChange([...values, { title: "", body: "" }])} />
    </fieldset>
  );
}

function FactRows({
  values,
  onChange,
}: {
  values: ServicePageContent["facts"];
  onChange: (values: ServicePageContent["facts"]) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Quick facts</legend>
      {values.map((fact, index) => (
        <div key={index} className="flex items-end gap-2">
          <TextField
            label="Label"
            value={fact.k}
            onChange={(k) =>
              onChange(
                values.map((item, i) => (i === index ? { ...item, k } : item)),
              )
            }
          />
          <TextField
            label="Value"
            value={fact.v}
            onChange={(v) =>
              onChange(
                values.map((item, i) => (i === index ? { ...item, v } : item)),
              )
            }
          />
          <Remove
            onClick={() => onChange(values.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <Add onClick={() => onChange([...values, { k: "", v: "" }])} />
    </fieldset>
  );
}

function Add({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-2 py-1 text-xs"
    >
      Add row
    </button>
  );
}

function Remove({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-1 rounded-full border px-2 py-1 text-xs"
    >
      Remove
    </button>
  );
}
