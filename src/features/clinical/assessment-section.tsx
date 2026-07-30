import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function AssessmentSection({
  patientId,
}: {
  patientId: Id<"patients">;
}) {
  const trends = useQuery(api.domains.assessments.listTrends, { patientId });
  const [selected, setSelected] = useState<Id<"formResponses"> | null>(null);
  const detail = useQuery(
    api.domains.assessments.getResponse,
    selected ? { responseId: selected } : "skip",
  );
  if (trends === undefined) return <p role="status">Loading assessments…</p>;
  if (trends.length === 0) return <p>No completed assessments.</p>;
  const max = Math.max(...trends.map((item) => item.score), 1);
  return (
    <div>
      <p className="mb-3">
        Scores and labels are instrument guidance for longitudinal review, not a
        diagnosis.
      </p>
      <svg
        viewBox="0 0 400 120"
        role="img"
        aria-label="Assessment scores over time; exact values follow in the table"
        className="mb-4 h-32 w-full max-w-2xl border"
      >
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          points={trends
            .map(
              (item, index) =>
                `${20 + (index * 360) / Math.max(trends.length - 1, 1)},${
                  105 - (item.score / max) * 90
                }`,
            )
            .join(" ")}
        />
      </svg>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b">
            <th className="py-2">Completed</th>
            <th>Instrument</th>
            <th>Score</th>
            <th>Instrument guidance</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {trends.map((item) => (
            <tr key={item.responseId} className="border-b">
              <td className="py-2">
                {new Date(item.completedAt).toLocaleDateString()}
              </td>
              <td>
                {item.instrumentName} v{item.instrumentVersion}
              </td>
              <td>{item.score}</td>
              <td>{item.interpretation ?? "—"}</td>
              <td>
                <button
                  type="button"
                  className="underline"
                  onClick={() => setSelected(item.responseId)}
                >
                  View responses
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected && (
        <section className="mt-4 rounded border p-3">
          <h3 className="font-semibold">Source responses</h3>
          {detail === undefined ? (
            <p role="status">Loading responses…</p>
          ) : detail === null ? (
            <p>Response unavailable.</p>
          ) : (
            <dl className="mt-2 grid grid-cols-[1fr_2fr] gap-2">
              {detail.definition.sections.flatMap((section) =>
                section.fields.map((field) => (
                  <div key={field.key} className="contents">
                    <dt>{field.label}</dt>
                    <dd>
                      {String(
                        (detail.response.answers as Record<string, unknown>)[
                          field.key
                        ] ?? "—",
                      )}
                    </dd>
                  </div>
                )),
              )}
            </dl>
          )}
        </section>
      )}
    </div>
  );
}
