# Data Exposure Review (Blueprint 13.2)

Reviewed 2026-08-01. Regression tests: `tests/unit/data-exposure.test.ts`.

## Purpose

Verify no protected health information (PHI) reaches prohibited channels:
URLs, browser storage, client/server logs, analytics, error reporting, email
subjects/preview text, SMS bodies, exports, or over-wide API responses.

## Channels reviewed

| Channel                       | Finding                                                                                                                     | Enforcement                                                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Route paths / query strings   | Only opaque Convex ids (`:patientId`, `:encounterId`, ...) appear in paths; no query-string state carries patient data.     | Regression test pins all route params to `:*Id` shape.                                                                                      |
| Browser storage               | No app code writes patient data to localStorage/sessionStorage; Clerk manages its own session tokens.                       | Spot review; no storage APIs used in `src/`.                                                                                                |
| Server logs                   | `convex/lib/logger.ts` accepts identifiers only (`LogContext` type); no other Convex file may call `console.*`.             | Type constraint + static regression test.                                                                                                   |
| Client logs                   | Error boundary shows a reference id, never error payloads (Increment 0.5, `docs/OBSERVABILITY.md`).                         | Existing observability tests.                                                                                                               |
| Analytics / error reporting   | None integrated. Adding one is a privacy decision requiring review.                                                         | N/A                                                                                                                                         |
| Email subjects & preview text | Templates use neutral wording; subjects built only from approved variables.                                                 | `APPROVED_TEMPLATE_VARIABLES` pinned to `practiceName`, `practicePhone`, `appointmentDate`, `appointmentTime` — no patient name or service. |
| SMS bodies                    | Same approved-variable set; renderer rejects unknown variables.                                                             | Existing communications tests + pinned variable list.                                                                                       |
| Exports & filenames           | Report exports are aggregate/de-identified (12.4); filenames carry report key + date range only.                            | `exportFileName` regression test; export audit events.                                                                                      |
| List/dashboard over-fetching  | Patient registry rows limited to identity fields via `toRegistryRow`; dashboard uses aggregate counts, not patient records. | Registry field-whitelist regression test.                                                                                                   |

## Rules going forward

- New list queries must map documents through an explicit row-shaping
  function; never return raw `Doc<"patients">` (or other clinical docs) to a
  list or dashboard surface.
- Any new template variable, analytics tool, or export column is a
  privacy-review change: update this document and the pinned tests together.
- Previously identified leaks get a regression test in
  `tests/unit/data-exposure.test.ts` before the fix is considered complete.
