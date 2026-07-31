import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { DOCUMENT_CATEGORIES } from "../../../convex/lib/documents";
import {
  useOpenDocument,
  useUploadDocument,
} from "../patients/documents-section";

/** Patient document upload and list (11.3). Uploads await staff review. */
export default function PortalDocumentsPage() {
  const documents = useQuery(api.domains.documents.myDocuments, {});
  const upload = useUploadDocument();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(DOCUMENT_CATEGORIES[0]);
  const open = useOpenDocument(setError);

  if (documents === undefined) {
    return <p role="status">Loading your documents…</p>;
  }

  return (
    <section>
      <h1 className="font-display text-2xl">Documents</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Files you upload are reviewed by the practice before they are used. PDF,
        JPEG, PNG, or TIFF up to 20 MB.
      </p>

      <form
        className="mt-4 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const input = form.elements.namedItem("file") as HTMLInputElement;
          const file = input.files?.[0];
          if (!file) return;
          setError(null);
          setBusy(true);
          upload({ file, category, title })
            .then(() => {
              setTitle("");
              form.reset();
            })
            .catch((e: Error) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <label className="sr-only" htmlFor="portal-document-category">
          Category
        </label>
        <select
          id="portal-document-category"
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
          className="rounded-full border px-4 py-1.5 text-sm disabled:opacity-50"
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
        <p className="mt-6">You have no documents yet.</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {documents.map((document) => (
            <li key={document._id} className="rounded border p-3 text-sm">
              <p className="font-medium">{document.title}</p>
              <p className="text-muted-foreground">
                {document.category} ·{" "}
                {document.reviewStatus === "pending"
                  ? "awaiting review"
                  : document.reviewStatus === "replacementRequested"
                    ? `replacement requested: ${document.reviewNote ?? ""}`
                    : document.reviewStatus}
              </p>
              {document.scanStatus === "clean" && (
                <button
                  type="button"
                  className="mt-2 rounded border px-2 py-1 text-xs"
                  onClick={() => open(document._id)}
                >
                  Download
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
