import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { DOCUMENT_CATEGORIES } from "../../../convex/lib/documents";

/** Convex HTTP endpoints live on the .site domain of the deployment. */
export function convexSiteUrl(): string {
  const url = (import.meta.env.VITE_CONVEX_URL as string | undefined) ?? "";
  return url.replace(".convex.cloud", ".convex.site");
}

/**
 * Opens a document through a single-use grant. The storage identifier is
 * never exposed; authorization is re-checked when the link is consumed.
 */
export function useOpenDocument(onError: (message: string) => void) {
  const createGrant = useMutation(api.domains.documents.createDownloadGrant);
  return (documentId: Id<"documents">) => {
    createGrant({ documentId })
      .then((path) => window.open(`${convexSiteUrl()}${path}`, "_blank"))
      .catch((error: Error) => onError(error.message));
  };
}

/** Uploads a file and attaches it to a chart (11.2). */
export function useUploadDocument() {
  const generateUploadUrl = useMutation(
    api.domains.documents.generateUploadUrl,
  );
  const attach = useMutation(api.domains.documents.attachDocument);
  return async (args: {
    patientId?: Id<"patients">;
    file: File;
    category: string;
    title: string;
  }) => {
    const uploadUrl = await generateUploadUrl(
      args.patientId ? { patientId: args.patientId } : {},
    );
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": args.file.type },
      body: args.file,
    });
    if (!response.ok) throw new Error("Upload failed");
    const { storageId } = (await response.json()) as {
      storageId: Id<"_storage">;
    };
    const result = await attach({
      patientId: args.patientId,
      storageId,
      category: args.category,
      title: args.title,
      mimeType: args.file.type,
      fileName: args.file.name,
    });
    if (!result.ok) throw new Error(result.error);
    return result.documentId;
  };
}

export function DocumentsSection({ patientId }: { patientId: Id<"patients"> }) {
  const documents = useQuery(api.domains.documents.listForPatient, {
    patientId,
  });
  const archive = useMutation(api.domains.documents.archiveDocument);
  const upload = useUploadDocument();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(DOCUMENT_CATEGORIES[0]);
  const open = useOpenDocument(setError);

  if (documents === undefined) return <p role="status">Loading documents…</p>;

  return (
    <div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const input = form.elements.namedItem("file") as HTMLInputElement;
          const file = input.files?.[0];
          if (!file) return;
          setError(null);
          setBusy(true);
          upload({ patientId, file, category, title })
            .then(() => {
              setTitle("");
              form.reset();
            })
            .catch((e: Error) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <label className="sr-only" htmlFor="document-category">
          Category
        </label>
        <select
          id="document-category"
          className="rounded border bg-card px-2 py-1 text-sm"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {DOCUMENT_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <input
          aria-label="Document title"
          placeholder="Title"
          className="rounded border bg-card px-2 py-1 text-sm"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <input
          type="file"
          name="file"
          aria-label="File"
          accept=".pdf,.jpg,.jpeg,.png,.tif"
          className="text-sm"
        />
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="rounded border px-3 py-1 text-sm disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {documents.length === 0 ? (
        <p className="mt-3">No documents on file.</p>
      ) : (
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Title</th>
              <th>Category</th>
              <th>Source</th>
              <th>Review</th>
              <th>Scan</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {documents.map((document) => {
              const current = document.versions.find(
                (version) => version._id === document.currentVersionId,
              );
              return (
                <tr key={document._id} className="border-b">
                  <td className="py-2">{document.title}</td>
                  <td>{document.category}</td>
                  <td>{document.source}</td>
                  <td>{document.reviewStatus}</td>
                  <td>{current?.scanStatus ?? "—"}</td>
                  <td className="flex gap-2 py-2">
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-xs"
                      disabled={current?.scanStatus !== "clean"}
                      onClick={() => open(document._id)}
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-xs"
                      onClick={() => {
                        const reason = window.prompt("Reason for archiving?");
                        if (reason) {
                          archive({ documentId: document._id, reason }).catch(
                            (e: Error) => setError(e.message),
                          );
                        }
                      }}
                    >
                      Archive
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
