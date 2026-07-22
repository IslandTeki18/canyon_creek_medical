import { usePaginatedQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";
import { useAuthConfigured } from "../../lib/auth";

const PAGE_SIZE = 25;

export default function PatientRegistryPage() {
  const configured = useAuthConfigured();
  return (
    <section>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Patients</h1>
        <Link
          to="/app/patients/new"
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
        >
          New patient
        </Link>
      </div>
      {configured ? (
        <Registry />
      ) : (
        <p className="mt-2 text-sm text-neutral-500">
          Authentication is not configured in this environment.
        </p>
      )}
    </section>
  );
}

function useDebounced(value: string, delayMs = 300): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function Registry() {
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<"active" | "archived" | "">("active");
  const debouncedTerm = useDebounced(term);
  const {
    results,
    status: queryStatus,
    loadMore,
  } = usePaginatedQuery(
    api.domains.patients.searchPatients,
    { term: debouncedTerm, status: status || undefined },
    { initialNumItems: PAGE_SIZE },
  );

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          aria-label="Search patients"
          placeholder="Name, date of birth, email, or phone"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="w-80 rounded border px-2 py-1 text-sm"
        />
        <select
          aria-label="Status filter"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="">All statuses</option>
        </select>
      </div>

      {queryStatus === "LoadingFirstPage" ? (
        <p role="status" className="mt-4 text-sm text-neutral-500">
          Loading patients…
        </p>
      ) : results.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">
          {debouncedTerm
            ? "No patients match this search."
            : "No patients yet."}
        </p>
      ) : (
        <>
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2">Name</th>
                <th>Date of birth</th>
                <th>Contact</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map((p) => (
                <tr key={p._id} className="border-b">
                  <td className="py-2">
                    <Link to={`/app/patients/${p._id}`} className="underline">
                      {p.legalLastName}, {p.legalFirstName}
                      {p.preferredName ? ` “${p.preferredName}”` : ""}
                    </Link>
                  </td>
                  <td>{p.dateOfBirth}</td>
                  <td>{p.phone ?? p.email ?? "—"}</td>
                  <td>{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {queryStatus === "CanLoadMore" && (
            <button
              type="button"
              onClick={() => loadMore(PAGE_SIZE)}
              className="mt-3 rounded border px-3 py-1.5 text-sm"
            >
              Load more
            </button>
          )}
        </>
      )}
    </div>
  );
}
