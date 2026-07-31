import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";
import { DOCUMENT_CATEGORIES } from "../../../convex/lib/documents";
import { useOpenDocument } from "./documents-section";

/** Staff review queue for uploaded documents (11.3). */
export default function DocumentReviewPage() {
  const queue = useQuery(api.domains.documents.listReviewQueue, {});
  const review = useMutation(api.domains.documents.reviewDocument);
  const share = useMutation(api.domains.documents.setPatientVisibility);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Record<string, string>>({});
  const open = useOpenDocument(setError);

  if (queue === undefined) return <p role="status">Loading review queue…</p>;

  return (
    <section>
      <h1 className="font-display text-3xl">Document review</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Uploads stay out of broader clinical use until they are reviewed.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {queue.length === 0 ? (
        <p className="mt-4">Nothing awaiting review.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {queue.map((document) => (
            <li key={document._id} className="rounded border p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{document.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {document.patientName} · {document.category} ·{" "}
                    {document.source} · scan {document.scanStatus}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    className="text-sm underline"
                    to={`/app/patients/${document.patientId}`}
                  >
                    Open chart
                  </Link>
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-sm"
                    disabled={document.scanStatus !== "clean"}
                    onClick={() => open(document._id)}
                  >
                    View file
                  </button>
                  <label className="sr-only" htmlFor={`cat-${document._id}`}>
                    Recategorize
                  </label>
                  <select
                    id={`cat-${document._id}`}
                    className="rounded border bg-card px-2 py-1 text-sm"
                    value={categories[document._id] ?? document.category}
                    onChange={(event) =>
                      setCategories((prev) => ({
                        ...prev,
                        [document._id]: event.target.value,
                      }))
                    }
                  >
                    {DOCUMENT_CATEGORIES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-sm"
                    onClick={() =>
                      review({
                        documentId: document._id,
                        decision: "accepted",
                        category: categories[document._id] ?? document.category,
                      }).catch((e: Error) => setError(e.message))
                    }
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-sm"
                    onClick={() => {
                      const note = window.prompt("What needs to be replaced?");
                      if (note) {
                        void review({
                          documentId: document._id,
                          decision: "replacementRequested",
                          note,
                        }).catch((e: Error) => setError(e.message));
                      }
                    }}
                  >
                    Request replacement
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-sm"
                    onClick={() => {
                      const note = window.prompt("Reason for restricting?");
                      if (note) {
                        void review({
                          documentId: document._id,
                          decision: "restricted",
                          note,
                        }).catch((e: Error) => setError(e.message));
                      }
                    }}
                  >
                    Restrict
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-sm"
                    onClick={() =>
                      share({ documentId: document._id, visible: true }).catch(
                        (e: Error) => setError(e.message),
                      )
                    }
                  >
                    Share to portal
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
