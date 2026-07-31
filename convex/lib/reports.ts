// Report definitions and CSV rendering (Increment 12.4). Reports are
// aggregate by construction: a row is a bucket and its counts, never a
// patient. Nothing here claims clinical causation — these are utilization
// and process measures.

export const REPORT_KEYS = [
  "appointmentOutcomes",
  "intakeCompletion",
  "reminderDelivery",
  "assessmentCompletion",
  "serviceUtilization",
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export function isReportKey(value: string): value is ReportKey {
  return (REPORT_KEYS as readonly string[]).includes(value);
}

/** Bounds that protect the deployment from an unbounded scan. */
export const MAX_RANGE_DAYS = 366;
export const MAX_ROWS = 5_000;

export interface ReportRow {
  bucket: string;
  metrics: Record<string, number>;
}

export interface ReportResult {
  key: ReportKey;
  from: string;
  to: string;
  columns: string[];
  rows: ReportRow[];
  truncated: boolean;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
}

/** RFC 4180 quoting. Buckets are labels and dates, but quote anyway. */
function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(result: ReportResult): string {
  const header = ["bucket", ...result.columns];
  const lines = [header.map(csvCell).join(",")];
  for (const row of result.rows) {
    lines.push(
      [
        csvCell(row.bucket),
        ...result.columns.map((column) => csvCell(row.metrics[column] ?? 0)),
      ].join(","),
    );
  }
  return lines.join("\n");
}

/** Export filenames carry the report and range only — never PHI. */
export function exportFileName(result: {
  key: string;
  from: string;
  to: string;
}): string {
  return `${result.key}-${result.from}-to-${result.to}.csv`;
}
