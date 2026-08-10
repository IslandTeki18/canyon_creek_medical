import { ConvexError } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import { Brain, Circle, Leaf, Pill, Shield, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Section, ServicePageContent } from "../../../convex/lib/content";
import {
  ContentCard,
  contentCardActionClass,
} from "../../components/ui/content-card";
import { useAuthConfigured } from "../../lib/auth";
import { Icon, type IconType } from "../public/marketing-chrome";
import { AutosaveStatus, useAutosave } from "./use-autosave";

const inputClass = "mt-1 block w-full rounded border bg-card px-3 py-2";
type PublishIssue = { path: string; message: string };
type Steps = Extract<Section, { type: "numberedSteps" }>["steps"];
const icons: Record<string, IconType> = {
  brain: Brain,
  leaf: Leaf,
  pill: Pill,
  shield: Shield,
  sparkles: Sparkles,
};

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
    sections: [
      { id: "how-it-works", type: "richText", text: "" },
      { id: "indications", type: "itemGrid", items: [] },
      { id: "steps", type: "numberedSteps", steps: [] },
    ],
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
  const saveDraft = useMutation(api.domains.content.saveServicePageDraft);
  const publishPage = useMutation(api.domains.content.publishServicePage);
  const discardDraft = useMutation(api.domains.content.discardServicePageDraft);
  const unpublishPage = useMutation(api.domains.content.unpublishServicePage);
  const archivePage = useMutation(api.domains.content.archiveServicePage);
  const restorePage = useMutation(api.domains.content.restoreServicePage);
  const [selectedId, setSelectedId] = useState<Id<"servicePages"> | null>(null);
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState<ServicePageContent>(emptyContent);
  const [error, setError] = useState<string | null>(null);
  const [publishIssues, setPublishIssues] = useState<PublishIssue[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [draggedId, setDraggedId] = useState<Id<"servicePages"> | null>(null);
  const selected = pages?.find((page) => page._id === selectedId);
  const autosave = useAutosave({
    enabled: selected !== undefined,
    value: content,
    save: (value) =>
      selectedId
        ? saveDraft({ servicePageId: selectedId, content: value })
        : Promise.resolve(),
  });

  function clearMessages() {
    setError(null);
    setPublishIssues([]);
    setSuccess(null);
  }

  function resetEditor() {
    const next = emptyContent();
    autosave.reset(next, true);
    setSelectedId(null);
    setSlug("");
    setContent(next);
    clearMessages();
  }

  function editPage(page: NonNullable<typeof pages>[number]) {
    const next = (page.draftContent ?? page.content) as ServicePageContent;
    autosave.reset(next, true);
    setSelectedId(page._id);
    setSlug(page.slug);
    setContent(next);
    clearMessages();
  }

  function field<K extends keyof ServicePageContent>(
    key: K,
    value: ServicePageContent[K],
    immediate = false,
  ) {
    const next = { ...content, [key]: value };
    setContent(next);
    if (immediate) void autosave.flushNow(next);
  }

  function replaceSection(index: number, section: Section, immediate = false) {
    field(
      "sections",
      content.sections.map((current, currentIndex) =>
        currentIndex === index ? section : current,
      ),
      immediate,
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (selected) {
      void autosave.flushNow();
      return;
    }
    clearMessages();
    setPending("save");
    try {
      const sortOrder =
        Math.max(0, ...(pages ?? []).map((page) => page.sortOrder)) + 1;
      await createPage({ slug, sortOrder, content });
      resetEditor();
      setSuccess("Service page created.");
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
      if (action === "publish" && selectedId === servicePageId) {
        await autosave.flushNow();
      }
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
      if (page?.content) {
        const next = page.content as ServicePageContent;
        autosave.reset(next);
        setContent(next);
      }
      setSuccess("Unpublished changes discarded.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not discard changes",
      );
    } finally {
      setPending(null);
    }
  }

  async function restore(servicePageId: Id<"servicePages">) {
    clearMessages();
    setPending(`restore:${servicePageId}`);
    try {
      await restorePage({ servicePageId });
      setSuccess("Service page restored.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore page");
    } finally {
      setPending(null);
    }
  }

  async function move(servicePageId: Id<"servicePages">, to: number) {
    if (!pages) return;
    const ordered = pages.filter((page) => page.status !== "archived");
    const from = ordered.findIndex((page) => page._id === servicePageId);
    if (from < 0 || to < 0 || to >= ordered.length || from === to) return;
    const sortOrders = ordered.map((page) => page.sortOrder);
    const moved = ordered.splice(from, 1)[0]!;
    ordered.splice(to, 0, moved);
    clearMessages();
    setPending("reorder");
    try {
      await Promise.all(
        ordered.map((page, index) =>
          page.sortOrder === sortOrders[index]
            ? Promise.resolve()
            : updatePage({
                servicePageId: page._id,
                sortOrder: sortOrders[index]!,
              }),
        ),
      );
      setSuccess("Website order updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update order");
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
  const visiblePages = pages.filter(
    (page) => showArchived || page.status !== "archived",
  );
  const [howItWorks, indications, steps] = content.sections;

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
        {(error ?? autosave.error) && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error ?? autosave.error}
          </p>
        )}
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
        {pages.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No service pages yet. Create the first page.
          </p>
        ) : visiblePages.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No active service pages. Show archived to view older pages.
          </p>
        ) : (
          <ul className="mt-4 grid list-none gap-4 p-0 sm:grid-cols-2">
            {visiblePages.map((page) => {
              const card = (page.draftContent ??
                page.content) as ServicePageContent;
              const active = pages.filter((item) => item.status !== "archived");
              const index = active.findIndex((item) => item._id === page._id);
              const state =
                page.status === "archived"
                  ? "archived"
                  : page.status === "draft"
                    ? "draft"
                    : page.draftContent
                      ? "edited"
                      : "live";
              return (
                <li key={page._id}>
                  <ContentCard
                    title={card.title}
                    summary={card.summary}
                    chips={card.chips}
                    state={state}
                    media={
                      <div className="grid size-12 place-items-center rounded-full bg-clay-100 text-clay-700">
                        <Icon as={icons[card.icon] ?? Circle} size={24} />
                      </div>
                    }
                    draggable={page.status !== "archived" && pending === null}
                    dragHandle={page.status !== "archived"}
                    onDragStart={() => setDraggedId(page._id)}
                    onDragEnd={() => setDraggedId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (draggedId) void move(draggedId, index);
                      setDraggedId(null);
                    }}
                    primaryAction={
                      page.status === "archived" ? (
                        <button
                          type="button"
                          disabled={pending !== null}
                          onClick={() => void restore(page._id)}
                          className="rounded-full border px-3 py-1 text-sm disabled:opacity-50"
                        >
                          Restore
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => editPage(page)}
                            className="rounded-full border px-3 py-1 text-sm"
                          >
                            Edit
                          </button>
                          {(page.status === "draft" || page.draftContent) && (
                            <button
                              type="button"
                              disabled={pending !== null}
                              onClick={() =>
                                void changeStatus(page._id, "publish")
                              }
                              className="rounded-full bg-clay px-3 py-1 text-sm text-white disabled:opacity-50"
                            >
                              {page.status === "draft"
                                ? "Put on the website"
                                : "Publish edits"}
                            </button>
                          )}
                        </>
                      )
                    }
                    menuActions={
                      page.status === "archived" ? null : (
                        <>
                          {page.status === "published" && (
                            <a
                              href={`/services/${page.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className={contentCardActionClass}
                            >
                              View as visitor
                            </a>
                          )}
                          {page.content && page.draftContent && (
                            <button
                              type="button"
                              disabled={pending !== null}
                              onClick={() => void discard(page._id)}
                              className={contentCardActionClass}
                            >
                              Discard edits
                            </button>
                          )}
                          {page.status === "published" && (
                            <button
                              type="button"
                              disabled={pending !== null}
                              onClick={() =>
                                void changeStatus(page._id, "unpublish")
                              }
                              className={contentCardActionClass}
                            >
                              Take off the website
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={pending !== null || index === 0}
                            onClick={() => void move(page._id, index - 1)}
                            className={contentCardActionClass}
                          >
                            Move earlier
                          </button>
                          <button
                            type="button"
                            disabled={
                              pending !== null || index === active.length - 1
                            }
                            onClick={() => void move(page._id, index + 1)}
                            className={contentCardActionClass}
                          >
                            Move later
                          </button>
                          <button
                            type="button"
                            disabled={pending !== null}
                            onClick={() => void archive(page._id)}
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

      <form
        onSubmit={save}
        onBlur={() => void autosave.flushNow()}
        className="space-y-4 rounded-lg border p-5"
      >
        <h2 className="font-display text-2xl">
          {selected ? "Edit page" : "New page"}
        </h2>
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
            onChange={(values, immediate) => field("chips", values, immediate)}
          />
        </div>
        <div id="service-tags">
          <TagRows
            values={content.tags}
            onChange={(values, immediate) => field("tags", values, immediate)}
          />
        </div>
        <TextArea
          id="service-intro"
          label="Introduction"
          value={content.intro}
          onChange={(value) => field("intro", value)}
          rows={5}
        />
        {/* ponytail: fixed-order section editing; the canvas (ticket 03) replaces this. */}
        <div id="service-sections">
          {howItWorks?.type === "richText" && (
            <TextArea
              label="How it works"
              value={howItWorks.text}
              onChange={(text) => replaceSection(0, { ...howItWorks, text })}
              rows={5}
            />
          )}
          {indications?.type === "itemGrid" && (
            <StringRows
              label="Indications"
              values={indications.items}
              onChange={(items, immediate) =>
                replaceSection(1, { ...indications, items }, immediate)
              }
            />
          )}
          {steps?.type === "numberedSteps" && (
            <StepRows
              values={steps.steps}
              onChange={(nextSteps, immediate) =>
                replaceSection(2, { ...steps, steps: nextSteps }, immediate)
              }
            />
          )}
        </div>
        <div id="service-facts">
          <FactRows
            values={content.facts}
            onChange={(values, immediate) => field("facts", values, immediate)}
          />
        </div>
        <TextArea
          id="service-safetyNote"
          label="Safety note"
          value={content.safetyNote}
          onChange={(value) => field("safetyNote", value)}
          rows={4}
        />
        {!selected && (
          <button
            type="submit"
            disabled={pending !== null}
            className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {pending === "save" ? "Saving…" : "Create page"}
          </button>
        )}
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
  onChange: (values: string[], immediate?: boolean) => void;
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
            onClick={() =>
              onChange(
                values.filter((_, i) => i !== index),
                true,
              )
            }
          />
        </div>
      ))}
      <Add onClick={() => onChange([...values, ""], true)} />
    </fieldset>
  );
}

function TagRows({
  values,
  onChange,
}: {
  values: ServicePageContent["tags"];
  onChange: (values: ServicePageContent["tags"], immediate?: boolean) => void;
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
                  true,
                )
              }
            />{" "}
            Accent
          </label>
          <Remove
            onClick={() =>
              onChange(
                values.filter((_, i) => i !== index),
                true,
              )
            }
          />
        </div>
      ))}
      <Add onClick={() => onChange([...values, { label: "" }], true)} />
    </fieldset>
  );
}

function StepRows({
  values,
  onChange,
}: {
  values: Steps;
  onChange: (values: Steps, immediate?: boolean) => void;
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
            onClick={() =>
              onChange(
                values.filter((_, i) => i !== index),
                true,
              )
            }
          />
        </div>
      ))}
      <Add
        onClick={() => onChange([...values, { title: "", body: "" }], true)}
      />
    </fieldset>
  );
}

function FactRows({
  values,
  onChange,
}: {
  values: ServicePageContent["facts"];
  onChange: (values: ServicePageContent["facts"], immediate?: boolean) => void;
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
            onClick={() =>
              onChange(
                values.filter((_, i) => i !== index),
                true,
              )
            }
          />
        </div>
      ))}
      <Add onClick={() => onChange([...values, { k: "", v: "" }], true)} />
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
